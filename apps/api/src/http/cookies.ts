export type SameSitePolicy = "Strict" | "Lax" | "None";

export type CookieOptions = Readonly<{
  name: string;
  value: string;
  maxAgeSeconds?: number;
  path?: string;
  httpOnly?: boolean;
  sameSite?: SameSitePolicy;
  secure?: boolean;
}>;

export const parseCookies = (value: string | undefined): Map<string, string> => {
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

export const serializeCookie = (options: CookieOptions): string => {
  const parts = [
    `${options.name}=${encodeURIComponent(options.value)}`,
    `Path=${options.path ?? "/"}`,
    `SameSite=${options.sameSite ?? "Lax"}`
  ];

  if (typeof options.maxAgeSeconds === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  }
  if (options.httpOnly ?? true) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
};

type ReplyLike = Readonly<{
  header: (name: string, value: unknown) => unknown;
  getHeader: (name: string) => unknown;
}>;

export const appendSetCookie = (reply: ReplyLike, cookie: string): void => {
  const current = reply.getHeader("set-cookie");
  if (!current) {
    reply.header("set-cookie", cookie);
    return;
  }
  if (Array.isArray(current)) {
    reply.header("set-cookie", [...current, cookie]);
    return;
  }
  if (typeof current === "string") {
    reply.header("set-cookie", [current, cookie]);
    return;
  }
  reply.header("set-cookie", cookie);
};

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
