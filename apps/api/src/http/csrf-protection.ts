import { randomUUID } from "node:crypto";
import { appendSetCookie, parseCookies, serializeCookie } from "./cookies";

export type CsrfConfig = Readonly<{
  cookieName: string;
  headerName: string;
  forceSecureCookies: boolean;
  trustedOrigins: readonly string[];
}>;

const CSRF_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;

type RequestLike = Readonly<{
  headers: Readonly<Record<string, string | string[] | undefined>>;
  method: string;
  protocol: string;
}>;

type ReplyLike = Readonly<{
  header: (name: string, value: unknown) => unknown;
  getHeader: (name: string) => unknown;
}>;

export const ensureCsrfCookie = (
  request: RequestLike,
  reply: ReplyLike,
  config: CsrfConfig
): string => {
  const cookies = parseCookies(readSingleHeader(request.headers.cookie));
  const existing = cookies.get(config.cookieName);
  if (isValidToken(existing)) return existing;

  const token = randomUUID();
  appendSetCookie(
    reply,
    serializeCookie({
      name: config.cookieName,
      value: token,
      maxAgeSeconds: CSRF_COOKIE_MAX_AGE_SECONDS,
      secure: shouldUseSecureCookies(request, config.forceSecureCookies),
      httpOnly: false,
      sameSite: "Lax"
    })
  );
  return token;
};

export const validateCsrfRequest = (
  request: RequestLike,
  config: CsrfConfig
): Readonly<{ ok: true } | { ok: false; reason: string }> => {
  const cookies = parseCookies(readSingleHeader(request.headers.cookie));
  const cookieToken = cookies.get(config.cookieName);
  const headerValue = request.headers[config.headerName];
  const headerToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!isValidToken(cookieToken) || !isValidToken(headerToken)) {
    return { ok: false, reason: "Missing CSRF token" };
  }
  if (cookieToken !== headerToken) {
    return { ok: false, reason: "Mismatched CSRF token" };
  }

  const originValidation = validateOriginOrReferer(request, config.trustedOrigins);
  if (!originValidation.ok) return originValidation;
  return { ok: true };
};

export const shouldRequireCsrf = (requestPath: string, method: string): boolean => {
  const normalizedMethod = method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod)) return false;
  if (requestPath.startsWith("/auth/google/")) return false;
  if (requestPath === "/health" || requestPath === "/security/metrics") return false;
  return true;
};

const validateOriginOrReferer = (
  request: RequestLike,
  trustedOrigins: readonly string[]
): Readonly<{ ok: true } | { ok: false; reason: string }> => {
  if (trustedOrigins.length === 0) {
    return { ok: false, reason: "No trusted origins configured" };
  }

  const allowed = new Set(trustedOrigins.map((origin) => normalizeOrigin(origin)).filter(Boolean) as string[]);
  if (allowed.size === 0) {
    return { ok: false, reason: "No valid trusted origins configured" };
  }

  const originHeader = readSingleHeader(request.headers.origin);
  if (originHeader) {
    const normalizedOrigin = normalizeOrigin(originHeader);
    if (normalizedOrigin && allowed.has(normalizedOrigin)) return { ok: true };
    return { ok: false, reason: "Invalid Origin header" };
  }

  const refererHeader = readSingleHeader(request.headers.referer);
  if (refererHeader) {
    const refererOrigin = originFromUrl(refererHeader);
    if (refererOrigin && allowed.has(refererOrigin)) return { ok: true };
    return { ok: false, reason: "Invalid Referer header" };
  }

  return { ok: false, reason: "Missing Origin/Referer header" };
};

const readSingleHeader = (value: string | string[] | undefined): string | undefined => {
  const first = Array.isArray(value) ? value[0] : value;
  const normalized = first?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
};

const normalizeOrigin = (value: string): string | null => {
  try {
    const parsed = new URL(value);
    return parsed.origin;
  } catch {
    return null;
  }
};

const originFromUrl = (value: string): string | null => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const isValidToken = (value: string | undefined): value is string =>
  typeof value === "string" && value.trim().length >= 16;

const shouldUseSecureCookies = (request: RequestLike, forceSecureCookies: boolean): boolean =>
  forceSecureCookies || request.protocol === "https";
