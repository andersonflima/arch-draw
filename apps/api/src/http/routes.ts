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

type RouteDependencies = Readonly<{
  repository: ArchitectureRepository;
  clock: Clock;
  idGenerator: IdGenerator;
}>;

type IdParams = Readonly<{
  id: string;
}>;

export const registerRoutes = async (
  app: FastifyInstance,
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

  app.get("/architectures", async (request, reply) =>
    listArchitectures(resolveSessionToken(request, reply))
  );

  app.post<{ Body: { title?: string; description?: string } }>(
    "/architectures",
    async (request, reply) => {
      const sessionToken = resolveSessionToken(request, reply);
      const architecture = await createArchitecture({
        sessionToken,
        title: request.body.title ?? "Untitled architecture",
        description: request.body.description
      });

      return reply.code(201).send(architecture);
    }
  );

  app.get<{ Params: IdParams }>("/architectures/:id", async (request, reply) => {
    const architecture = await readArchitecture(
      request.params.id,
      resolveSessionToken(request, reply)
    );
    return architecture ?? reply.code(404).send({ error: "Architecture not found" });
  });

  app.put<{ Params: IdParams; Body: ArchitectureDocument }>(
    "/architectures/:id",
    async (request, reply) => {
      if (request.params.id !== request.body.id) {
        return reply.code(400).send({ errors: ["Route id does not match body id"] });
      }

      const result = await saveArchitecture(
        request.body,
        resolveSessionToken(request, reply)
      );
      return result.ok
        ? result.architecture
        : reply.code(result.statusCode).send({ errors: result.errors });
    }
  );

  app.delete<{ Params: IdParams }>("/architectures/:id", async (request, reply) => {
    const deleted = await deleteArchitecture(
      request.params.id,
      resolveSessionToken(request, reply)
    );
    return deleted ? reply.code(204).send() : reply.code(404).send();
  });

  app.get<{ Params: IdParams }>("/architectures/:id/export", async (request, reply) => {
    const sharePackage = await exportArchitecture(
      request.params.id,
      resolveSessionToken(request, reply)
    );

    if (!sharePackage) {
      return reply.code(404).send({ error: "Architecture not found" });
    }

    return reply
      .header("content-disposition", `attachment; filename="${request.params.id}.archdraw.json"`)
      .send(sharePackage);
  });

  app.post<{ Body: ArchitectureSharePackage }>("/architectures/import", async (request, reply) => {
    const result = await importArchitecture(
      request.body,
      resolveSessionToken(request, reply)
    );

    return result.ok
      ? reply.code(201).send(result.architecture)
      : reply.code(400).send({ errors: result.errors });
  });
};
