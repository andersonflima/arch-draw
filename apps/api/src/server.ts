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
    logger: true,
    bodyLimit: 2 * 1024 * 1024
  });
  const connection = await createSqliteConnection(config.databasePath);

  runMigrations(connection);

  await app.register(cors, {
    origin: [...config.webOrigins],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });

  await registerRoutes(app, {
    repository: makeSqliteArchitectureRepository(connection),
    clock: systemClock,
    idGenerator: cryptoIdGenerator
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    return payload;
  });

  app.addHook("onClose", async () => {
    connection.close();
  });

  return app;
};
