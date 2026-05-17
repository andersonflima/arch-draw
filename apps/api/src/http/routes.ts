import type { FastifyInstance } from "fastify";
import type { ArchitectureDocument, ArchitectureSharePackage } from "@arch-draw/domain";
import { makeCreateArchitecture } from "../application/use-cases/create-architecture";
import { makeDeleteArchitecture } from "../application/use-cases/delete-architecture";
import { makeExportArchitecture } from "../application/use-cases/export-architecture";
import { makeImportArchitecture } from "../application/use-cases/import-architecture";
import { makeListArchitectures } from "../application/use-cases/list-architectures";
import { makeReadArchitecture } from "../application/use-cases/read-architecture";
import { makeSaveArchitecture } from "../application/use-cases/save-architecture";
import type { ArchitectureRepository } from "../application/contracts/architecture-repository";
import type { Clock } from "../application/contracts/clock";
import type { IdGenerator } from "../application/contracts/id-generator";
import { resolveSessionToken } from "./session-token";
import { getSecurityMetricsSnapshot, recordSecurityEvent } from "./security-observability";

type RouteDependencies = Readonly<{
  repository: ArchitectureRepository;
  clock: Clock;
  idGenerator: IdGenerator;
  forceSecureCookies: boolean;
}>;

type IdParams = Readonly<{
  id: string;
}>;

const ARCHITECTURE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const MAX_TITLE_LENGTH = 180;
const MAX_DESCRIPTION_LENGTH = 4000;

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

  app.get("/health", async () => ({ ok: true }));
  app.get("/security/metrics", async () => ({ ok: true, metrics: getSecurityMetricsSnapshot() }));

  app.get("/architectures", async (request, reply) =>
    listArchitectures(resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies))
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

      const sessionToken = resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies);
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
      resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies)
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
        resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies)
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
      resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies)
    );
    return deleted ? reply.code(204).send() : reply.code(404).send();
  });

  app.get<{ Params: IdParams }>("/architectures/:id/export", async (request, reply) => {
    if (!isSafeArchitectureId(request.params.id)) {
      recordSecurityEvent("invalid_id");
      request.log.warn({ event: "invalid_id", route: "/architectures/:id/export", id: request.params.id }, "Rejected invalid export id");
      return reply.code(400).send({ errors: ["Invalid architecture id"] });
    }
    const sharePackage = await exportArchitecture(
      request.params.id,
      resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies)
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
      resolveRequestSessionToken(request, reply, dependencies.forceSecureCookies)
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

const isSafeArchitectureId = (id: string): boolean => ARCHITECTURE_ID_PATTERN.test(id);

const makeSafeFilename = (id: string): string =>
  id.replaceAll(/[^a-zA-Z0-9._:-]/g, "_");

const resolveRequestSessionToken = (
  request: Parameters<typeof resolveSessionToken>[0],
  reply: Parameters<typeof resolveSessionToken>[1],
  forceSecureCookies: boolean
): string =>
  resolveSessionToken(request, reply, { forceSecureCookies });
