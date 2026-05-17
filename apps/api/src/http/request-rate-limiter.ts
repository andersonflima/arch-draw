import { createHash } from "node:crypto";
import type { AppRedisClient } from "../infra/redis/redis-client";

export type RateLimiterConfig = Readonly<{
  windowMs: number;
  maxRequests: number;
  maxEntries: number;
}>;

export type RateLimitResult = Readonly<{
  allowed: boolean;
  count: number;
}>;

export type RequestRateLimiter = Readonly<{
  consume: (identityKey: string) => Promise<RateLimitResult>;
}>;

type MemoryEntry = Readonly<{
  windowStart: number;
  count: number;
  expiresAt: number;
  touchedAt: number;
}>;

export const createRequestRateLimiter = (
  config: RateLimiterConfig,
  redisClient: AppRedisClient | null
): RequestRateLimiter =>
  redisClient
    ? createRedisRateLimiter(config, redisClient)
    : createMemoryRateLimiter(config);

const createMemoryRateLimiter = (config: RateLimiterConfig): RequestRateLimiter => {
  const entries = new Map<string, MemoryEntry>();

  const evictExpired = (now: number): void => {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
  };

  const evictOverflow = (): void => {
    if (entries.size <= config.maxEntries) return;
    const candidates = [...entries.entries()]
      .sort((left, right) => left[1].touchedAt - right[1].touchedAt);
    const overflow = entries.size - config.maxEntries;
    for (let index = 0; index < overflow; index += 1) {
      const candidate = candidates[index];
      if (!candidate) break;
      entries.delete(candidate[0]);
    }
  };

  return {
    consume: async (identityKey: string): Promise<RateLimitResult> => {
      const now = Date.now();
      evictExpired(now);
      evictOverflow();

      const current = entries.get(identityKey);
      if (!current || now - current.windowStart >= config.windowMs) {
        entries.set(identityKey, {
          windowStart: now,
          count: 1,
          expiresAt: now + config.windowMs,
          touchedAt: now
        });
        return { allowed: true, count: 1 };
      }

      const nextCount = current.count + 1;
      entries.set(identityKey, {
        ...current,
        count: nextCount,
        touchedAt: now
      });
      return { allowed: nextCount <= config.maxRequests, count: nextCount };
    }
  };
};

const createRedisRateLimiter = (
  config: RateLimiterConfig,
  redisClient: AppRedisClient
): RequestRateLimiter => {
  const luaScript = `
    local current = redis.call("INCR", KEYS[1])
    if current == 1 then
      redis.call("PEXPIRE", KEYS[1], ARGV[1])
    end
    return current
  `;

  return {
    consume: async (identityKey: string): Promise<RateLimitResult> => {
      const key = `security:ratelimit:${hashKey(identityKey)}:${Math.floor(Date.now() / config.windowMs)}`;
      const result = await redisClient.eval(luaScript, {
        keys: [key],
        arguments: [String(config.windowMs)]
      });
      const count = typeof result === "number" ? result : Number(result ?? 0);
      return { allowed: count <= config.maxRequests, count };
    }
  };
};

const hashKey = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
