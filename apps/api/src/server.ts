import cors from "@fastify/cors";
import Fastify from "fastify";
import type { AppConfig } from "./config/env";
import { cryptoIdGenerator } from "./application/contracts/id-generator";
import { systemClock } from "./application/contracts/clock";
import { createSqliteConnection } from "./infra/sqlite/connection";
import { runMigrations } from "./infra/sqlite/migrations";
import { makeSqliteArchitectureRepository } from "./infra/sqlite/sqlite-architecture-repository";
import { registerRoutes } from "./http/routes";

export const createServer = async (config: AppConfig) => {
  const app = Fastify({
    logger: true
  });
  const connection = await createSqliteConnection(config.databasePath);

  runMigrations(connection);

  await app.register(cors, {
    origin: [...config.webOrigins],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });

  await registerRoutes(app, {
    repository: makeSqliteArchitectureRepository(connection),
    clock: systemClock,
    idGenerator: cryptoIdGenerator
  });

  app.addHook("onClose", async () => {
    connection.close();
  });

  return app;
};
