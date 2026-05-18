import cors from "@fastify/cors";
import Fastify from "fastify";
import type { AppConfig } from "./config/env";
import { cryptoIdGenerator } from "./application/contracts/id-generator";
import { systemClock } from "./application/contracts/clock";
import { makeCompressedArchitectureRepository } from "./infra/compressed/compressed-architecture-repository";
import { registerRoutes } from "./http/routes";
import { createGoogleAuth } from "./http/google-auth";
import { recordSecurityEvent } from "./http/security-observability";
import {
  ensureCsrfCookie,
  shouldRequireCsrf,
  validateCsrfRequest
} from "./http/csrf-protection";
import { createRequestRateLimiter } from "./http/request-rate-limiter";
import { createRedisClient } from "./infra/redis/redis-client";
import { parseCookies } from "./http/cookies";
import { createCollaborationHub } from "./http/realtime/collaboration-hub";

export const createServer = async (config: AppConfig) => {
  const app = Fastify({
    logger: true,
    trustProxy: config.trustProxyHops ?? config.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
    requestTimeout: 10_000,
    connectionTimeout: 10_000,
    keepAliveTimeout: 10_000
  });
  const redisClient = config.redisUrl ? await createRedisClient(config.redisUrl) : null;
  const rateLimiter = createRequestRateLimiter(
    {
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMaxRequests,
      maxEntries: config.rateLimitMaxEntries
    },
    redisClient
  );
  const googleAuth = await createGoogleAuth(config, redisClient);
  const architectureRepository = makeCompressedArchitectureRepository(config.storagePath);
  const collaborationHub = createCollaborationHub();

  await app.register(cors, {
    origin: [...config.webOrigins],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "content-type",
      "x-csrf-token",
      "x-security-metrics-token",
      "authorization"
    ]
  });

  await registerRoutes(app, {
    repository: architectureRepository,
    clock: systemClock,
    idGenerator: cryptoIdGenerator,
    forceSecureCookies: config.forceSecureCookies,
    collaborationHub
  });

  app.get("/auth/session", async (request) => {
    const session = await googleAuth.resolveSession(request);
    return {
      ok: true,
      authEnabled: session.authEnabled,
      authenticated: session.authenticated,
      user: session.user
    };
  });

  app.get("/auth/google/start", async (request, reply) => {
    await googleAuth.start(request, reply);
  });

  app.get("/auth/google/callback", async (request, reply) => {
    await googleAuth.callback(request, reply);
  });

  app.post("/auth/logout", async (request, reply) => {
    await googleAuth.logout(request, reply);
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-dns-prefetch-control", "off");
    reply.header("x-permitted-cross-domain-policies", "none");
    reply.header("permissions-policy", "geolocation=(), microphone=(), camera=()");
    reply.header("cross-origin-opener-policy", "same-origin");
    reply.header("cross-origin-resource-policy", "same-origin");
    reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    reply.removeHeader("server");
    if (_request.protocol === "https") {
      reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
    return payload;
  });

  app.addHook("onRequest", async (request, reply) => {
    const requestPath = getRequestPathname(request.url);
    const allowedHosts = config.allowedHosts ?? [];
    if (allowedHosts.length > 0 && !isAllowedHost(request.headers.host, allowedHosts)) {
      recordSecurityEvent("invalid_host");
      request.log.warn(
        { event: "invalid_host", host: request.headers.host, route: requestPath },
        "Rejected request with invalid host header"
      );
      await reply.code(400).send({ errors: ["Invalid host header"] });
      return;
    }

    ensureCsrfCookie(request, reply, {
      cookieName: config.csrfCookieName,
      headerName: config.csrfHeaderName,
      forceSecureCookies: config.forceSecureCookies,
      trustedOrigins: config.webOrigins
    });

    if (shouldRequireCsrf(requestPath, request.method)) {
      const csrf = validateCsrfRequest(request, {
        cookieName: config.csrfCookieName,
        headerName: config.csrfHeaderName,
        forceSecureCookies: config.forceSecureCookies,
        trustedOrigins: config.webOrigins
      });
      if (!csrf.ok) {
        recordSecurityEvent("csrf_rejected");
        request.log.warn(
          { event: "csrf_rejected", route: requestPath, reason: csrf.reason },
          "Rejected request due to CSRF validation"
        );
        await reply.code(403).send({ errors: ["CSRF validation failed"] });
        return;
      }
    }

    const isSecurityMetricsRoute = requestPath === "/security/metrics";
    if (isSecurityMetricsRoute) {
      if (!config.securityMetricsToken) {
        await reply.code(404).send({ error: "Not found" });
        return;
      }

      const providedToken = extractMetricsToken(request.headers.authorization, request.headers["x-security-metrics-token"]);
      if (!providedToken || providedToken !== config.securityMetricsToken) {
        recordSecurityEvent("unauthorized_metrics_access");
        request.log.warn({ event: "unauthorized_metrics_access", route: request.url }, "Rejected unauthorized metrics access");
        await reply.code(401).send({ errors: ["Unauthorized"] });
        return;
      }

      return;
    }

    const ip = request.ip || "unknown";
    const cookies = parseCookies(readSingleHeader(request.headers.cookie));
    const sessionIdentity = cookies.get("archdraw_session")
      ?? cookies.get("archdraw_auth")
      ?? "anonymous";
    const rateKey = `${sessionIdentity}|${ip}`;
    const rate = await rateLimiter.consume(rateKey);
    if (rate.allowed) return;
    recordSecurityEvent("rate_limited");
    request.log.warn(
      { event: "rate_limited", ip, sessionIdentity, count: rate.count, windowMs: config.rateLimitWindowMs },
      "Rate limit exceeded"
    );
    await reply.code(429).send({ errors: ["Too many requests, retry later"] });
    return;
  });

  app.addHook("onRequest", async (request, reply) => {
    if (!googleAuth.isEnabled()) return;
    const requestPath = getRequestPathname(request.url);
    if (!isProtectedRoute(requestPath)) return;

    const user = await googleAuth.resolveAuthenticatedUser(request);
    if (user) return;

    recordSecurityEvent("unauthorized_request");
    request.log.warn({ event: "unauthenticated_request", route: requestPath }, "Rejected unauthenticated request");
    await reply.code(401).send({ errors: ["Authentication required"] });
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
    if (redisClient) await redisClient.quit();
  });

  return app;
};

const getRequestPathname = (value: string): string => {
  try {
    return new URL(value, "http://localhost").pathname;
  } catch {
    return value;
  }
};

const isProtectedRoute = (path: string): boolean =>
  path.startsWith("/architectures");

const extractMetricsToken = (
  authorization: string | undefined,
  customHeader: string | string[] | undefined
): string | undefined => {
  const headerValue = Array.isArray(customHeader) ? customHeader[0] : customHeader;
  if (typeof headerValue === "string" && headerValue.trim().length > 0) {
    return headerValue.trim();
  }

  if (!authorization) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() || undefined;
};

const readSingleHeader = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

const isAllowedHost = (
  hostHeader: string | string[] | undefined,
  allowedHosts: readonly string[]
): boolean => {
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!host) return false;
  const hostValue = host.trim().toLowerCase();
  if (!hostValue) return false;
  const normalizedHost = normalizeHost(hostValue);
  return allowedHosts.includes(normalizedHost);
};

const normalizeHost = (value: string): string => {
  if (!value.startsWith("[")) {
    return value.split(":")[0] ?? value;
  }

  const index = value.indexOf("]");
  if (index < 0) return value;
  return value.slice(0, index + 1);
};
