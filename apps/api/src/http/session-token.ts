import { randomUUID } from "node:crypto";
import { appendSetCookie, parseCookies, serializeCookie } from "./cookies";

const SESSION_COOKIE_NAME = "archdraw_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type SessionCookieOptions = Readonly<{
  forceSecureCookies: boolean;
}>;

type RequestLike = Readonly<{
  headers: Readonly<Record<string, string | string[] | undefined>>;
  protocol: string;
}>;

type ReplyLike = Readonly<{
  header: (name: string, value: unknown) => unknown;
  getHeader: (name: string) => unknown;
}>;

export const resolveSessionToken = (
  request: RequestLike,
  reply: ReplyLike,
  options: SessionCookieOptions
): string => {
  const cookies = parseCookies(readHeaderValue(request.headers.cookie));
  const existingToken = cookies.get(SESSION_COOKIE_NAME);

  if (isValidSessionToken(existingToken)) {
    return existingToken;
  }

  const sessionToken = randomUUID();
  appendSetCookie(
    reply,
    serializeCookie({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      maxAgeSeconds: SESSION_COOKIE_MAX_AGE_SECONDS,
      secure: options.forceSecureCookies || request.protocol === "https",
      httpOnly: true,
      sameSite: "Lax"
    })
  );

  return sessionToken;
};

const isValidSessionToken = (value: string | undefined): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9-]{16,}$/.test(value);

const readHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};
