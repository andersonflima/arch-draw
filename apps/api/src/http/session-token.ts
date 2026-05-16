import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

const SESSION_COOKIE_NAME = "archdraw_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const resolveSessionToken = (
  request: FastifyRequest,
  reply: FastifyReply
): string => {
  const cookies = parseCookies(request.headers.cookie);
  const existingToken = cookies.get(SESSION_COOKIE_NAME);

  if (isValidSessionToken(existingToken)) {
    return existingToken;
  }

  const sessionToken = randomUUID();
  reply.header(
    "set-cookie",
    serializeCookie(request.protocol === "https", SESSION_COOKIE_NAME, sessionToken)
  );

  return sessionToken;
};

const isValidSessionToken = (value: string | undefined): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9-]{16,}$/.test(value);

const parseCookies = (value: string | undefined): Map<string, string> => {
  if (!value) return new Map();

  return new Map(
    value
      .split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const separatorIndex = entry.indexOf("=");
        if (separatorIndex < 0) return [entry, ""];
        const key = entry.slice(0, separatorIndex).trim();
        const rawCookieValue = entry.slice(separatorIndex + 1).trim();
        return [key, safeDecodeURIComponent(rawCookieValue)];
      })
  );
};

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const serializeCookie = (secure: boolean, name: string, value: string): string => {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax"
  ];

  if (secure) parts.push("Secure");

  return parts.join("; ");
};
