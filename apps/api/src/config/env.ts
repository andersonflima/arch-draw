export type AppConfig = Readonly<{
  apiHost: string;
  apiPort: number;
  storagePath: string;
  webOrigins: readonly string[];
  trustProxy: boolean | number | string | string[];
  trustProxyHops?: number;
  forceSecureCookies: boolean;
  sessionTokenSecret?: string;
  securityMetricsToken?: string;
  redisUrl?: string;
  googleOAuthClientId?: string;
  googleOAuthClientSecret?: string;
  googleOAuthRedirectUri?: string;
  authPostLoginRedirect: string;
  csrfCookieName: string;
  csrfHeaderName: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  rateLimitMaxEntries: number;
  allowedHosts: readonly string[];
}>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const trustProxyRaw = parseTrustProxy(env.TRUST_PROXY);
  return {
    apiHost: env.API_HOST ?? "127.0.0.1",
    apiPort: Number.parseInt(env.API_PORT ?? "8080", 10),
    storagePath: parseOptionalNonEmptyValue(env.ARCH_DRAW_STORAGE_PATH)
      ?? parseLegacyDatabaseStoragePath(env.DATABASE_PATH)
      ?? "./data/arch-draw.store",
    webOrigins: parseWebOrigins(env.WEB_ORIGINS ?? env.WEB_ORIGIN),
    trustProxy: trustProxyRaw,
    trustProxyHops: parseOptionalPositiveInteger(env.TRUST_PROXY_HOPS),
    forceSecureCookies: parseBoolean(env.FORCE_SECURE_COOKIES, (env.NODE_ENV ?? "").trim() === "production"),
    sessionTokenSecret: parseOptionalNonEmptyValue(env.SESSION_TOKEN_SECRET),
    securityMetricsToken: parseOptionalNonEmptyValue(env.SECURITY_METRICS_TOKEN),
    redisUrl: parseOptionalNonEmptyValue(env.REDIS_URL),
    googleOAuthClientId: parseOptionalNonEmptyValue(env.GOOGLE_OAUTH_CLIENT_ID),
    googleOAuthClientSecret: parseOptionalNonEmptyValue(env.GOOGLE_OAUTH_CLIENT_SECRET),
    googleOAuthRedirectUri: parseOptionalNonEmptyValue(env.GOOGLE_OAUTH_REDIRECT_URI),
    authPostLoginRedirect: normalizeRedirectPath(env.AUTH_POST_LOGIN_REDIRECT),
    csrfCookieName: parseOptionalNonEmptyValue(env.CSRF_COOKIE_NAME) ?? "archdraw_csrf",
    csrfHeaderName: normalizeHeaderName(parseOptionalNonEmptyValue(env.CSRF_HEADER_NAME) ?? "x-csrf-token"),
    rateLimitWindowMs: parsePositiveInteger(env.RATE_LIMIT_WINDOW_MS, 60_000),
    rateLimitMaxRequests: parsePositiveInteger(env.RATE_LIMIT_MAX_REQUESTS, 240),
    rateLimitMaxEntries: parsePositiveInteger(env.RATE_LIMIT_MAX_ENTRIES, 20_000),
    allowedHosts: parseCsvList(env.ALLOWED_HOSTS)
  };
};

const parseLegacyDatabaseStoragePath = (value: string | undefined): string | undefined => {
  const legacyPath = parseOptionalNonEmptyValue(value);
  if (!legacyPath) return undefined;
  return legacyPath.endsWith(".sqlite")
    ? `${legacyPath.slice(0, -".sqlite".length)}.store`
    : legacyPath;
};

const parseWebOrigins = (value: string | undefined): readonly string[] =>
  (value ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map(normalizeOrigin)
    .filter((origin) => origin.length > 0);

const normalizeOrigin = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/g, "");
  }
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = parseOptionalPositiveInteger(value);
  return parsed ?? fallback;
};

const parseOptionalPositiveInteger = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

const parseTrustProxy = (
  value: string | undefined
): boolean | number | string | string[] => {
  if (value === undefined) return false;
  const normalized = value.trim();
  if (!normalized) return false;
  const lower = normalized.toLowerCase();
  if (["1", "true", "yes", "on"].includes(lower)) return true;
  if (["0", "false", "no", "off"].includes(lower)) return false;
  if (/^\d+$/.test(lower)) {
    const parsed = Number.parseInt(lower, 10);
    if (parsed > 0) return parsed;
  }
  if (normalized.includes(",")) {
    const values = normalized
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (values.length > 0) return values;
  }
  return normalized;
};

const parseOptionalNonEmptyValue = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeHeaderName = (value: string): string => value.trim().toLowerCase();

const parseCsvList = (value: string | undefined): readonly string[] => {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
};

const normalizeRedirectPath = (value: string | undefined): string => {
  const normalized = (value ?? "/").trim();
  if (!normalized.startsWith("/")) return "/";
  if (normalized.startsWith("//")) return "/";
  return normalized;
};
