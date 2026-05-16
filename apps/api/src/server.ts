import cors from "@fastify/cors";
import Fastify from "fastify";
import type { AppConfig } from "./config/env";
import { cryptoIdGenerator } from "./application/contracts/id-generator";
import { systemClock } from "./application/contracts/clock";
import { createSqliteConnection } from "./infra/sqlite/connection";
import { runMigrations } from "./infra/sqlite/migrations";
import { makeSqliteArchitectureRepository } from "./infra/sqlite/sqlite-architecture-repository";
import { registerRoutes } from "./http/routes";
import { recordSecurityEvent } from "./http/security-observability";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 240;
type RateLimitState = Readonly<{ windowStart: number; count: number }>;

export const createServer = async (config: AppConfig) => {
  const app = Fastify({
    logger: true,
    bodyLimit: 2 * 1024 * 1024,
    requestTimeout: 10_000,
    connectionTimeout: 10_000,
    keepAliveTimeout: 10_000
  });
  const rateByIp = new Map<string, RateLimitState>();
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

  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/security/metrics") return;

    const now = Date.now();
    const key = request.ip || "unknown";
    const state = rateByIp.get(key);
    const current = !state || now - state.windowStart >= RATE_LIMIT_WINDOW_MS
      ? { windowStart: now, count: 1 }
      : { windowStart: state.windowStart, count: state.count + 1 };
    rateByIp.set(key, current);

    if (current.count <= RATE_LIMIT_MAX_REQUESTS) return;
    recordSecurityEvent("rate_limited");
    request.log.warn(
      { event: "rate_limited", ip: key, count: current.count, windowMs: RATE_LIMIT_WINDOW_MS },
      "Rate limit exceeded"
    );
    await reply.code(429).send({ errors: ["Too many requests, retry later"] });
  });

  app.setErrorHandler(async (error, request, reply) => {
    const errorCode = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error
      && typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : 500;

    if (errorCode === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
      recordSecurityEvent("invalid_content_type");
      request.log.warn({ event: "invalid_content_type", route: request.url }, "Rejected unsupported media type");
      await reply.code(415).send({ errors: ["Unsupported media type"] });
      return;
    }

    if (errorCode === "FST_ERR_CTP_BODY_TOO_LARGE") {
      recordSecurityEvent("payload_too_large");
      request.log.warn({ event: "payload_too_large", route: request.url }, "Rejected oversized payload");
      await reply.code(413).send({ errors: ["Payload too large"] });
      return;
    }

    request.log.error({ err: error }, "Unhandled server error");
    await reply.code(statusCode).send({ error: "Internal server error" });
  });

  app.addHook("onClose", async () => {
    connection.close();
  });

  return app;
};
