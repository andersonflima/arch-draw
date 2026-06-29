import type { FastifyInstance } from "fastify";
import {
  normalizeArchitecture,
  type ArchitectureDocument,
  type ArchitectureSharePackage,
  validateArchitecture
} from "@arch-draw/domain";
import { makeCreateArchitecture } from "../application/use-cases/create-architecture";
import { makeDeleteArchitecture } from "../application/use-cases/delete-architecture";
import { makeExportArchitecture } from "../application/use-cases/export-architecture";
import { makeImportArchitecture } from "../application/use-cases/import-architecture";
import { makeListArchitectures } from "../application/use-cases/list-architectures";
import { makeReadArchitecture } from "../application/use-cases/read-architecture";
import { makeSaveArchitecture } from "../application/use-cases/save-architecture";
import { makeDiscoverCloudArchitecture } from "../application/use-cases/discover-cloud-architecture";
import type { ArchitectureRepository } from "../application/contracts/architecture-repository";
import type { Clock } from "../application/contracts/clock";
import type { IdGenerator } from "../application/contracts/id-generator";
import type { CloudInventoryProvider } from "../application/contracts/cloud-inventory";
import { resolveSessionToken } from "./session-token";
import { getSecurityMetricsSnapshot, recordSecurityEvent } from "./security-observability";
import type { CollaborationHub } from "./realtime/collaboration-hub";

type RouteDependencies = Readonly<{
  repository: ArchitectureRepository;
  clock: Clock;
  idGenerator: IdGenerator;
  forceSecureCookies: boolean;
  sessionTokenSecret?: string;
  collaborationHub: CollaborationHub;
  cloudInventoryProvider: CloudInventoryProvider;
}>;

type IdParams = Readonly<{
  id: string;
}>;

const ARCHITECTURE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const ROLE_ARN_PATTERN = /^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]{1,512}$/;
const MAX_TITLE_LENGTH = 180;
const MAX_DESCRIPTION_LENGTH = 4000;
const SHARE_ID_PATTERN = /^[a-zA-Z0-9_-]{12,160}$/;
const MAX_COLLABORATOR_LABEL_LENGTH = 96;
const SHARE_ACCESS_MODES = new Set(["edit", "read-only"] as const);
type ShareAccessMode = "edit" | "read-only";

export const registerRoutes = async (
  app: FastifyInstance<any, any, any, any, any>,
  dependencies: RouteDependencies
): Promise<void> => {
  const createArchitecture = makeCreateArchitecture(
    dependencies.repository,
    dependencies.clock,
    dependencies.idGenerator
  );
  const listArchitectures = makeListArchitectures(dependencies.repository);
  const readArchitecture = makeReadArchitecture(dependencies.repository);
  const saveArchitecture = makeSaveArchitecture(dependencies.repository, dependencies.clock);
  const deleteArchitecture = makeDeleteArchitecture(dependencies.repository);
  const exportArchitecture = makeExportArchitecture(
    dependencies.repository,
    dependencies.clock
  );
  const importArchitecture = makeImportArchitecture(
    dependencies.repository,
    dependencies.clock,
    dependencies.idGenerator
  );
  const discoverCloudArchitecture = makeDiscoverCloudArchitecture(
    dependencies.cloudInventoryProvider,
    dependencies.clock,
    dependencies.idGenerator
  );

  app.get("/health", async () => ({ ok: true }));
  app.get("/security/metrics", async () => ({ ok: true, metrics: getSecurityMetricsSnapshot() }));

  app.post<{ Body: unknown }>("/cloud/aws/discover", async (request, reply) => {
    if (!isObject(request.body)) {
      recordSecurityEvent("invalid_body");
      request.log.warn({ event: "invalid_body", route: "/cloud/aws/discover" }, "Rejected non-object cloud discovery payload");
      return reply.code(400).send({ errors: ["Request body must be a JSON object"] });
    }

    const roleArn = normalizeOptionalString(request.body["roleArn"], 2048);
    const externalId = normalizeOptionalString(request.body["externalId"], 256);
    const accountLabel = normalizeOptionalString(request.body["accountLabel"], 120);
    const regions = sanitizeAwsRegions(request.body["regions"]);
    if (roleArn === null || externalId === null || accountLabel === null || !regions) {
      recordSecurityEvent("invalid_body");
      request.log.warn({ event: "invalid_body", route: "/cloud/aws/discover" }, "Rejected invalid cloud discovery payload");
      return reply.code(400).send({ errors: ["Invalid AWS discovery payload"] });
    }
    // An IAM role ARN is mandatory: discovery must always assume the caller's role
    // and never fall back to the server's own ambient credentials, which would leak
    // the host account's infrastructure to any caller (confused-deputy).
    if (!roleArn || !ROLE_ARN_PATTERN.test(roleArn)) {
      recordSecurityEvent("invalid_body");
      request.log.warn({ event: "invalid_body", route: "/cloud/aws/discover", field: "roleArn" }, "Rejected invalid IAM role ARN");
      return reply.code(400).send({ errors: ["A valid IAM role ARN is required"] });
    }

    const result = await discoverCloudArchitecture({
      provider: "aws",
      roleArn,
      externalId,
      accountLabel,
      regions
    });
    if (!result.ok) return reply.code(400).send({ errors: result.errors });

    const saved = await saveArchitecture(
      result.architecture,
      resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies, dependencies.sessionTokenSecret)
    );
    return saved.ok
      ? reply.code(201).send(saved.architecture)
      : reply.code(saved.statusCode).send({ errors: saved.errors });
  });

  app.get("/architectures", async (request, reply) =>
    listArchitectures(resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies, dependencies.sessionTokenSecret))
  );

  app.post<{ Body: unknown }>(
    "/architectures",
    async (request, reply) => {
      if (request.body !== undefined && !isObject(request.body)) {
        recordSecurityEvent("invalid_body");
        request.log.warn({ event: "invalid_body", route: "/architectures" }, "Rejected non-object payload");
        return reply.code(400).send({ errors: ["Request body must be a JSON object"] });
      }
      const body = isObject(request.body) ? request.body : {};
      const title = normalizeOptionalString(body["title"], MAX_TITLE_LENGTH);
      if (title === null) {
        recordSecurityEvent("invalid_body");
        request.log.warn({ event: "invalid_body", route: "/architectures", field: "title" }, "Rejected invalid title");
        return reply.code(400).send({ errors: [`Title must be a string with up to ${MAX_TITLE_LENGTH} characters`] });
      }
      const description = normalizeOptionalString(body["description"], MAX_DESCRIPTION_LENGTH);
      if (description === null) {
        recordSecurityEvent("invalid_body");
        request.log.warn({ event: "invalid_body", route: "/architectures", field: "description" }, "Rejected invalid description");
        return reply.code(400).send({ errors: [`Description must be a string with up to ${MAX_DESCRIPTION_LENGTH} characters`] });
      }

      const sessionToken = resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies, dependencies.sessionTokenSecret);
      const architecture = await createArchitecture({
        sessionToken,
        title: title ?? "Untitled architecture",
        description
      });

      return reply.code(201).send(architecture);
    }
  );

  app.get<{ Params: IdParams }>("/architectures/:id", async (request, reply) => {
    if (!isSafeArchitectureId(request.params.id)) {
      recordSecurityEvent("invalid_id");
      request.log.warn({ event: "invalid_id", route: "/architectures/:id", id: request.params.id }, "Rejected invalid architecture id");
      return reply.code(400).send({ errors: ["Invalid architecture id"] });
    }
    const architecture = await readArchitecture(
      request.params.id,
      resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies, dependencies.sessionTokenSecret)
    );
    return architecture ?? reply.code(404).send({ error: "Architecture not found" });
  });

  app.put<{ Params: IdParams; Body: unknown }>(
    "/architectures/:id",
    async (request, reply) => {
      if (!isSafeArchitectureId(request.params.id)) {
        recordSecurityEvent("invalid_id");
        request.log.warn({ event: "invalid_id", route: "/architectures/:id", id: request.params.id }, "Rejected invalid route id");
        return reply.code(400).send({ errors: ["Invalid architecture id"] });
      }
      if (!isObject(request.body)) {
        recordSecurityEvent("invalid_body");
        request.log.warn({ event: "invalid_body", route: "/architectures/:id" }, "Rejected non-object payload");
        return reply.code(400).send({ errors: ["Request body must be a JSON object"] });
      }
      const bodyId = normalizeRequiredString(request.body["id"]);
      if (!bodyId) {
        recordSecurityEvent("invalid_body");
        request.log.warn({ event: "invalid_body", route: "/architectures/:id", field: "id" }, "Rejected missing body id");
        return reply.code(400).send({ errors: ["Architecture body id is required"] });
      }
      if (!isSafeArchitectureId(bodyId)) {
        recordSecurityEvent("invalid_id");
        request.log.warn({ event: "invalid_id", route: "/architectures/:id", bodyId }, "Rejected invalid body id");
        return reply.code(400).send({ errors: ["Invalid architecture id in body"] });
      }
      if (request.params.id !== bodyId) {
        return reply.code(400).send({ errors: ["Route id does not match body id"] });
      }

      const result = await saveArchitecture(
        request.body as ArchitectureDocument,
        resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies, dependencies.sessionTokenSecret)
      );
      return result.ok
        ? result.architecture
        : reply.code(result.statusCode).send({ errors: result.errors });
    }
  );

  app.delete<{ Params: IdParams }>("/architectures/:id", async (request, reply) => {
    if (!isSafeArchitectureId(request.params.id)) {
      recordSecurityEvent("invalid_id");
      request.log.warn({ event: "invalid_id", route: "/architectures/:id", id: request.params.id }, "Rejected invalid delete id");
      return reply.code(400).send({ errors: ["Invalid architecture id"] });
    }
    const deleted = await deleteArchitecture(
      request.params.id,
      resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies, dependencies.sessionTokenSecret)
    );
    return deleted ? reply.code(204).send() : reply.code(404).send();
  });

  app.post<{ Params: IdParams; Body: unknown }>("/architectures/:id/share", async (request, reply) => {
    if (!isSafeArchitectureId(request.params.id)) {
      recordSecurityEvent("invalid_id");
      request.log.warn({ event: "invalid_id", route: "/architectures/:id/share", id: request.params.id }, "Rejected invalid share id");
      return reply.code(400).send({ errors: ["Invalid architecture id"] });
    }
    if (request.body !== undefined && !isObject(request.body)) {
      recordSecurityEvent("invalid_body");
      request.log.warn({ event: "invalid_body", route: "/architectures/:id/share" }, "Rejected non-object payload");
      return reply.code(400).send({ errors: ["Request body must be a JSON object"] });
    }
    const body = isObject(request.body) ? request.body : {};
    const accessMode = sanitizeShareAccessMode(body["accessMode"]) ?? "edit";

    const sessionToken = resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies, dependencies.sessionTokenSecret);
    const existingArchitecture = await readArchitecture(request.params.id, sessionToken);
    if (!existingArchitecture) return reply.code(404).send({ error: "Architecture not found" });

    const existingShare = await dependencies.repository.findShareByArchitectureId(
      request.params.id,
      sessionToken,
      accessMode
    );
    if (existingShare) {
      return reply.send({
        shareId: existingShare.shareId,
        sharePath: `/?share=${encodeURIComponent(existingShare.shareId)}`
      });
    }

    const now = dependencies.clock.now();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const shareId = makeShareId(dependencies.idGenerator.create());
      const created = await dependencies.repository.createShare(
        shareId,
        request.params.id,
        sessionToken,
        now,
        accessMode
      );
      if (!created) continue;
      return reply.code(201).send({
        shareId: created.shareId,
        sharePath: `/?share=${encodeURIComponent(created.shareId)}`
      });
    }

    return reply.code(409).send({ errors: ["Could not create share link, retry"] });
  });

  app.get<{ Params: Readonly<{ shareId: string }> }>(
    "/architectures/shared/:shareId",
    async (request, reply) => {
      if (!isSafeShareId(request.params.shareId)) {
        recordSecurityEvent("invalid_id");
        request.log.warn({ event: "invalid_id", route: "/architectures/shared/:shareId", shareId: request.params.shareId }, "Rejected invalid share id");
        return reply.code(400).send({ errors: ["Invalid share id"] });
      }
      const share = await dependencies.repository.findShareById(request.params.shareId);
      if (!share) return reply.code(404).send({ error: "Shared architecture not found" });
      const architecture = await dependencies.repository.findByShareId(request.params.shareId);
      if (!architecture) return reply.code(404).send({ error: "Shared architecture not found" });
      return {
        architecture,
        accessMode: share.accessMode
      };
    }
  );

  app.put<{ Params: Readonly<{ shareId: string }>; Querystring: Readonly<{ clientId?: string }> ; Body: unknown }>(
    "/architectures/shared/:shareId",
    async (request, reply) => {
      if (!isSafeShareId(request.params.shareId)) {
        recordSecurityEvent("invalid_id");
        request.log.warn({ event: "invalid_id", route: "/architectures/shared/:shareId", shareId: request.params.shareId }, "Rejected invalid share id");
        return reply.code(400).send({ errors: ["Invalid share id"] });
      }
      if (!isObject(request.body)) {
        recordSecurityEvent("invalid_body");
        request.log.warn({ event: "invalid_body", route: "/architectures/shared/:shareId" }, "Rejected non-object shared payload");
        return reply.code(400).send({ errors: ["Request body must be a JSON object"] });
      }

      const normalized = normalizeArchitecture({
        ...(request.body as ArchitectureDocument),
        updatedAt: dependencies.clock.now()
      });
      const validation = validateArchitecture(normalized);
      if (!validation.ok) {
        recordSecurityEvent("invalid_body");
        return reply.code(400).send({ errors: validation.errors });
      }

      const share = await dependencies.repository.findShareById(request.params.shareId);
      if (!share) return reply.code(404).send({ error: "Shared architecture not found" });
      if (share.accessMode !== "edit") {
        recordSecurityEvent("invalid_body");
        return reply.code(403).send({ errors: ["Share link is read-only"] });
      }

      const saved = await dependencies.repository.saveByShareId(request.params.shareId, normalized);
      if (!saved) return reply.code(404).send({ error: "Shared architecture not found" });

      const clientId = sanitizeCollaboratorId(request.query.clientId);
      if (clientId) {
        dependencies.collaborationHub.publishDocument({
          shareId: request.params.shareId,
          clientId,
          updatedAt: saved.updatedAt
        });
      }

      return saved;
    }
  );

  app.post<{
    Params: Readonly<{ shareId: string }>;
    Body: unknown;
  }>("/architectures/shared/:shareId/cursor", async (request, reply) => {
    if (!isSafeShareId(request.params.shareId)) {
      recordSecurityEvent("invalid_id");
      request.log.warn({ event: "invalid_id", route: "/architectures/shared/:shareId/cursor", shareId: request.params.shareId }, "Rejected invalid share id");
      return reply.code(400).send({ errors: ["Invalid share id"] });
    }
    if (!isObject(request.body)) {
      recordSecurityEvent("invalid_body");
      request.log.warn({ event: "invalid_body", route: "/architectures/shared/:shareId/cursor" }, "Rejected non-object cursor payload");
      return reply.code(400).send({ errors: ["Request body must be a JSON object"] });
    }

    const body = request.body as Readonly<Record<string, unknown>>;
    const clientId = sanitizeCollaboratorId(body["clientId"]);
    const displayName = sanitizeCollaboratorLabel(body["displayName"]);
    const color = sanitizeCollaboratorColor(body["color"]);
    const x = sanitizeCoordinate(body["x"]);
    const y = sanitizeCoordinate(body["y"]);
    const visible = typeof body["visible"] === "boolean" ? body["visible"] : true;

    if (!clientId || !displayName || !color || x === null || y === null) {
      recordSecurityEvent("invalid_body");
      return reply.code(400).send({ errors: ["Invalid cursor payload"] });
    }

    const sharedArchitecture = await dependencies.repository.findByShareId(request.params.shareId);
    if (!sharedArchitecture) return reply.code(404).send({ error: "Shared architecture not found" });

    dependencies.collaborationHub.publishCursor({
      shareId: request.params.shareId,
      clientId,
      displayName,
      color,
      x,
      y,
      visible,
      at: dependencies.clock.now()
    });
    return reply.code(204).send();
  });

  app.post<{
    Params: Readonly<{ shareId: string }>;
    Body: unknown;
  }>("/architectures/shared/:shareId/view", async (request, reply) => {
    if (!isSafeShareId(request.params.shareId)) {
      recordSecurityEvent("invalid_id");
      request.log.warn({ event: "invalid_id", route: "/architectures/shared/:shareId/view", shareId: request.params.shareId }, "Rejected invalid share id");
      return reply.code(400).send({ errors: ["Invalid share id"] });
    }
    if (!isObject(request.body)) {
      recordSecurityEvent("invalid_body");
      request.log.warn({ event: "invalid_body", route: "/architectures/shared/:shareId/view" }, "Rejected non-object view payload");
      return reply.code(400).send({ errors: ["Request body must be a JSON object"] });
    }

    const body = request.body as Readonly<Record<string, unknown>>;
    const clientId = sanitizeCollaboratorId(body["clientId"]);
    const zoom = sanitizeViewportScale(body["zoom"]);
    const panX = sanitizeCoordinate(body["panX"]);
    const panY = sanitizeCoordinate(body["panY"]);
    const maximizedNodeId = sanitizeOptionalArchitectureId(body["maximizedNodeId"]);
    if (!clientId || zoom === null || panX === null || panY === null) {
      recordSecurityEvent("invalid_body");
      return reply.code(400).send({ errors: ["Invalid view payload"] });
    }

    const share = await dependencies.repository.findShareById(request.params.shareId);
    if (!share) return reply.code(404).send({ error: "Shared architecture not found" });

    dependencies.collaborationHub.publishView({
      shareId: request.params.shareId,
      clientId,
      zoom,
      panX,
      panY,
      maximizedNodeId,
      at: dependencies.clock.now()
    });
    return reply.code(204).send();
  });

  app.get<{
    Params: Readonly<{ shareId: string }>;
    Querystring: Readonly<{
      clientId?: string;
      displayName?: string;
      color?: string;
    }>;
  }>("/architectures/shared/:shareId/events", async (request, reply) => {
    if (!isSafeShareId(request.params.shareId)) {
      recordSecurityEvent("invalid_id");
      request.log.warn({ event: "invalid_id", route: "/architectures/shared/:shareId/events", shareId: request.params.shareId }, "Rejected invalid share id");
      return reply.code(400).send({ errors: ["Invalid share id"] });
    }

    const architecture = await dependencies.repository.findByShareId(request.params.shareId);
    if (!architecture) return reply.code(404).send({ error: "Shared architecture not found" });

    const clientId = sanitizeCollaboratorId(request.query.clientId) ?? makeShareId(dependencies.idGenerator.create());
    const displayName = sanitizeCollaboratorLabel(request.query.displayName) ?? "Collaborator";
    const color = sanitizeCollaboratorColor(request.query.color) ?? "#f97316";
    const joined = dependencies.collaborationHub.join({
      shareId: request.params.shareId,
      clientId,
      displayName,
      color
    });

    reply.hijack();
    const response = reply.raw;
    response.setHeader("content-type", "text/event-stream; charset=utf-8");
    response.setHeader("cache-control", "no-cache, no-transform");
    response.setHeader("connection", "keep-alive");
    response.flushHeaders?.();

    const sendEvent = (eventName: string, payload: unknown): void => {
      response.write(`event: ${eventName}\n`);
      response.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    sendEvent("snapshot", {
      clientId,
      architecture,
      participants: joined.participants,
      currentView: joined.currentView
    });

    const unsubscribe = joined.subscribe((event) => {
      sendEvent("event", event);
    });
    const heartbeat = setInterval(() => {
      response.write(": ping\n\n");
    }, 15_000);

    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      joined.leave();
      response.end();
    });
  });

  app.get<{ Params: IdParams }>("/architectures/:id/export", async (request, reply) => {
    if (!isSafeArchitectureId(request.params.id)) {
      recordSecurityEvent("invalid_id");
      request.log.warn({ event: "invalid_id", route: "/architectures/:id/export", id: request.params.id }, "Rejected invalid export id");
      return reply.code(400).send({ errors: ["Invalid architecture id"] });
    }
    const sharePackage = await exportArchitecture(
      request.params.id,
      resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies, dependencies.sessionTokenSecret)
    );

    if (!sharePackage) {
      return reply.code(404).send({ error: "Architecture not found" });
    }

    const safeFilename = makeSafeFilename(request.params.id);
    return reply
      .header("content-disposition", `attachment; filename="${safeFilename}.archdraw.json"`)
      .send(sharePackage);
  });

  app.post<{ Body: unknown }>("/architectures/import", async (request, reply) => {
    if (!isObject(request.body)) {
      recordSecurityEvent("invalid_body");
      request.log.warn({ event: "invalid_body", route: "/architectures/import" }, "Rejected non-object import payload");
      return reply.code(400).send({ errors: ["Request body must be a JSON object"] });
    }
    const result = await importArchitecture(
      request.body as ArchitectureSharePackage,
      resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies, dependencies.sessionTokenSecret)
    );

    return result.ok
      ? reply.code(201).send(result.architecture)
      : reply.code(400).send({ errors: result.errors });
  });
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeOptionalString = (value: unknown, maxLength: number): string | undefined | null => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : null;
};

const normalizeRequiredString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const sanitizeAwsRegions = (value: unknown): readonly string[] | null => {
  if (!Array.isArray(value)) return ["us-east-1"];
  const regions = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^[a-z]{2}-[a-z]+-\d$/.test(entry));
  if (regions.length !== value.length) return null;
  return [...new Set(regions)].slice(0, 8);
};

const isSafeArchitectureId = (id: string): boolean => ARCHITECTURE_ID_PATTERN.test(id);

const makeSafeFilename = (id: string): string =>
  id.replaceAll(/[^a-zA-Z0-9._:-]/g, "_");

const makeShareId = (seed: string): string =>
  seed.replaceAll(/[^a-zA-Z0-9]/g, "").slice(0, 40).padEnd(20, "x");

const isSafeShareId = (shareId: string): boolean => SHARE_ID_PATTERN.test(shareId);

const sanitizeCollaboratorId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^[a-zA-Z0-9_-]{6,120}$/.test(normalized)) return null;
  return normalized;
};

const sanitizeCollaboratorLabel = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > MAX_COLLABORATOR_LABEL_LENGTH) {
    return normalized.slice(0, MAX_COLLABORATOR_LABEL_LENGTH);
  }
  return normalized;
};

const sanitizeCollaboratorColor = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(normalized)) return null;
  return normalized;
};

const sanitizeCoordinate = (value: unknown): number | null => {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  if (value < -500_000 || value > 500_000) return null;
  return Number(value.toFixed(2));
};

const sanitizeViewportScale = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0.05 || value > 5) return null;
  return Number(value.toFixed(3));
};

const sanitizeOptionalArchitectureId = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return isSafeArchitectureId(normalized) ? normalized : null;
};

const sanitizeShareAccessMode = (value: unknown): ShareAccessMode | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return SHARE_ACCESS_MODES.has(normalized as ShareAccessMode)
    ? normalized as ShareAccessMode
    : null;
};

const resolveRequestSessionToken = (
  request: Parameters<typeof resolveSessionToken>[0],
  reply: Parameters<typeof resolveSessionToken>[1],
  forceSecureCookies: boolean,
  sessionTokenSecret?: string
): string =>
  resolveSessionToken(request, reply, { forceSecureCookies, secret: sessionTokenSecret });
