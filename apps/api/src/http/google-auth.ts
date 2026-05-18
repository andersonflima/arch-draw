import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env";
import { appendSetCookie, parseCookies, serializeCookie } from "./cookies";
import type { AppRedisClient } from "../infra/redis/redis-client";

const AUTH_COOKIE_NAME = "archdraw_auth";
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;
const OAUTH_STATE_TTL_MS = 10 * 60_000;

type GoogleUserInfoResponse = Readonly<{
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
}>;

type OAuthState = Readonly<{
  expiresAt: number;
  returnTo: string;
}>;

type AuthSession = Readonly<{
  user: AuthenticatedUser;
  expiresAt: number;
}>;

export type AuthenticatedUser = Readonly<{
  id: string;
  email: string;
  name: string;
  picture?: string;
}>;

export type AuthSessionSnapshot = Readonly<{
  authEnabled: boolean;
  authenticated: boolean;
  user: AuthenticatedUser | null;
}>;

type GoogleAuthConfig = Readonly<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLoginRedirect: string;
  allowedReturnOrigins: readonly string[];
}>;

type RequestLike = Readonly<{
  headers: Readonly<Record<string, string | string[] | undefined>>;
  protocol: string;
  query: unknown;
}>;

type ReplyLike = Readonly<{
  code: (statusCode: number) => ReplyLike;
  send: (payload?: unknown) => unknown;
  redirect: (url: string) => unknown;
  header: (name: string, value: unknown) => unknown;
  getHeader: (name: string) => unknown;
}>;

type AuthSessionStore = Readonly<{
  read: (token: string) => Promise<AuthSession | null>;
  write: (token: string, session: AuthSession) => Promise<void>;
  remove: (token: string) => Promise<void>;
}>;

export const createGoogleAuth = async (
  config: AppConfig,
  redisClient: AppRedisClient | null
) => {
  const googleConfig = resolveGoogleAuthConfig(config);
  const authSessionStore = createAuthSessionStore(redisClient);
  const oauthStates = new Map<string, OAuthState>();

  const clearExpiredEntries = (): void => {
    const now = Date.now();
    for (const [key, state] of oauthStates.entries()) {
      if (state.expiresAt <= now) oauthStates.delete(key);
    }
  };

  const resolveAuthenticatedUser = async (request: RequestLike): Promise<AuthenticatedUser | null> => {
    if (!googleConfig) return null;
    clearExpiredEntries();
    const token = parseCookies(readSingleHeader(request.headers.cookie)).get(AUTH_COOKIE_NAME);
    if (!token) return null;
    const session = await authSessionStore.read(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      await authSessionStore.remove(token);
      return null;
    }
    return session.user;
  };

  const resolveSession = async (request: RequestLike): Promise<AuthSessionSnapshot> => {
    if (!googleConfig) {
      return {
        authEnabled: false,
        authenticated: true,
        user: null
      };
    }

    const user = await resolveAuthenticatedUser(request);
    return {
      authEnabled: true,
      authenticated: Boolean(user),
      user
    };
  };

  const start = async (request: RequestLike, reply: ReplyLike): Promise<void> => {
    if (!googleConfig) {
      await reply.code(503).send({ errors: ["Google SSO is not configured"] });
      return;
    }

    clearExpiredEntries();
    const queryReturnTo = (request.query as { returnTo?: unknown } | undefined)?.returnTo;
    const returnTo = sanitizeReturnPath(
      googleConfig,
      typeof queryReturnTo === "string" && queryReturnTo.trim().length > 0
        ? queryReturnTo
        : googleConfig.postLoginRedirect
    );
    const state = randomUUID();
    oauthStates.set(state, {
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
      returnTo
    });

    const params = new URLSearchParams({
      client_id: googleConfig.clientId,
      redirect_uri: googleConfig.redirectUri,
      response_type: "code",
      scope: "openid profile email",
      include_granted_scopes: "true",
      state,
      prompt: "select_account"
    });

    reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  };

  const callback = async (request: RequestLike, reply: ReplyLike): Promise<void> => {
    if (!googleConfig) {
      await reply.code(503).send({ errors: ["Google SSO is not configured"] });
      return;
    }

    clearExpiredEntries();
    const query = request.query as Readonly<{ code?: string; state?: string }>;
    const code = typeof query.code === "string" ? query.code : undefined;
    const state = typeof query.state === "string" ? query.state : undefined;
    if (!code || !state) {
      await reply.redirect(appendAuthError(googleConfig.postLoginRedirect, "missing_code_or_state"));
      return;
    }

    const stateEntry = oauthStates.get(state);
    oauthStates.delete(state);
    if (!stateEntry || stateEntry.expiresAt <= Date.now()) {
      await reply.redirect(appendAuthError(googleConfig.postLoginRedirect, "invalid_state"));
      return;
    }

    try {
      const tokenResponse = await exchangeAuthorizationCode(googleConfig, code);
      const googleUser = await fetchGoogleUserInfo(tokenResponse.accessToken);

      const authToken = randomUUID();
      const expiresAt = Date.now() + AUTH_COOKIE_MAX_AGE_SECONDS * 1000;
      await authSessionStore.write(authToken, {
        user: googleUser,
        expiresAt
      });

      appendSetCookie(
        reply,
        serializeCookie({
          name: AUTH_COOKIE_NAME,
          value: authToken,
          maxAgeSeconds: AUTH_COOKIE_MAX_AGE_SECONDS,
          secure: config.forceSecureCookies || request.protocol === "https",
          httpOnly: true,
          sameSite: "Lax"
        })
      );
      await reply.redirect(stateEntry.returnTo);
    } catch {
      await reply.redirect(appendAuthError(stateEntry.returnTo, "oauth_failure"));
    }
  };

  const logout = async (request: RequestLike, reply: ReplyLike): Promise<void> => {
    const token = parseCookies(readSingleHeader(request.headers.cookie)).get(AUTH_COOKIE_NAME);
    if (token) await authSessionStore.remove(token);
    appendSetCookie(
      reply,
      serializeCookie({
        name: AUTH_COOKIE_NAME,
        value: "",
        maxAgeSeconds: 0,
        secure: config.forceSecureCookies || request.protocol === "https",
        httpOnly: true,
        sameSite: "Lax"
      })
    );
    await reply.code(204).send();
  };

  return {
    isEnabled: (): boolean => Boolean(googleConfig),
    resolveSession,
    resolveAuthenticatedUser,
    start,
    callback,
    logout
  };
};

const resolveGoogleAuthConfig = (config: AppConfig): GoogleAuthConfig | null => {
  if (!config.googleOAuthClientId || !config.googleOAuthClientSecret || !config.googleOAuthRedirectUri) {
    return null;
  }
  return {
    clientId: config.googleOAuthClientId,
    clientSecret: config.googleOAuthClientSecret,
    redirectUri: config.googleOAuthRedirectUri,
    postLoginRedirect: config.authPostLoginRedirect,
    allowedReturnOrigins: config.webOrigins
  };
};

const exchangeAuthorizationCode = async (
  config: GoogleAuthConfig,
  code: string
): Promise<Readonly<{ accessToken: string }>> => {
  const payload = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: payload.toString()
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed with status ${response.status}`);
  }

  const parsed = await response.json() as { access_token?: string };
  if (!parsed.access_token) {
    throw new Error("Google token exchange response is missing access_token");
  }

  return { accessToken: parsed.access_token };
};

const fetchGoogleUserInfo = async (accessToken: string): Promise<AuthenticatedUser> => {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error(`Google userinfo failed with status ${response.status}`);
  }

  const parsed = await response.json() as GoogleUserInfoResponse;
  if (!parsed.sub || !parsed.email || !parsed.name) {
    throw new Error("Google userinfo response is missing required fields");
  }

  return {
    id: parsed.sub,
    email: parsed.email,
    name: parsed.name,
    picture: typeof parsed.picture === "string" && parsed.picture.trim().length > 0
      ? parsed.picture
      : undefined
  };
};

export const sanitizeReturnPath = (config: Pick<GoogleAuthConfig, "allowedReturnOrigins">, value: string): string => {
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) return "/";
    return config.allowedReturnOrigins.includes(parsed.origin) ? parsed.toString() : "/";
  } catch {
    // Relative paths are accepted below for same-origin proxy deployments.
  }
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//")) return "/";
  return trimmed;
};

export const appendAuthError = (redirectTarget: string, code: string): string => {
  try {
    const parsed = new URL(redirectTarget);
    parsed.searchParams.set("auth_error", code);
    return parsed.toString();
  } catch {
    const [path = "/", fragment = ""] = redirectTarget.split("#", 2);
    const separator = path.includes("?") ? "&" : "?";
    const nextPath = `${path}${separator}auth_error=${encodeURIComponent(code)}`;
    return fragment ? `${nextPath}#${fragment}` : nextPath;
  }
};

const readSingleHeader = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

const createAuthSessionStore = (redisClient: AppRedisClient | null): AuthSessionStore => {
  if (!redisClient) {
    const memory = new Map<string, AuthSession>();
    return {
      read: async (token) => memory.get(token) ?? null,
      write: async (token, session) => {
        memory.set(token, session);
      },
      remove: async (token) => {
        memory.delete(token);
      }
    };
  }

  return {
    read: async (token) => {
      const payload = await redisClient.get(`security:oauth:session:${token}`);
      if (!payload) return null;
      try {
        const parsed = JSON.parse(payload) as AuthSession;
        return parsed ?? null;
      } catch {
        return null;
      }
    },
    write: async (token, session) => {
      const ttlSeconds = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));
      await redisClient.set(
        `security:oauth:session:${token}`,
        JSON.stringify(session),
        { EX: ttlSeconds }
      );
    },
    remove: async (token) => {
      await redisClient.del(`security:oauth:session:${token}`);
    }
  };
};
