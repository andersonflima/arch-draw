import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { appendSetCookie, parseCookies, serializeCookie } from "./cookies";

const SESSION_COOKIE_NAME = "archdraw_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type SessionCookieOptions = Readonly<{
  forceSecureCookies: boolean;
  // When set, anonymous session tokens are HMAC-signed and signatures are verified
  // on every request, so an attacker cannot fixate a victim onto a chosen token by
  // planting a well-formed cookie. Left unset, behaviour is unchanged.
  secret?: string;
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

  if (isAcceptedSessionToken(existingToken, options.secret)) {
    return existingToken;
  }

  const sessionToken = issueSessionToken(options.secret);
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

const SESSION_ID_PATTERN = /^[a-zA-Z0-9-]{16,}$/;

const issueSessionToken = (secret: string | undefined): string => {
  const id = randomUUID();
  return secret ? `${id}.${signSessionId(id, secret)}` : id;
};

const isAcceptedSessionToken = (
  value: string | undefined,
  secret: string | undefined
): value is string => {
  if (typeof value !== "string") return false;
  if (!secret) return SESSION_ID_PATTERN.test(value);
  return isValidSignedToken(value, secret);
};

const isValidSignedToken = (value: string, secret: string): boolean => {
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return false;
  const id = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!SESSION_ID_PATTERN.test(id)) return false;
  return timingSafeEqualStrings(signature, signSessionId(id, secret));
};

const signSessionId = (id: string, secret: string): string =>
  createHmac("sha256", secret).update(id).digest("hex");

const timingSafeEqualStrings = (a: string, b: string): boolean => {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
};

const readHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};
