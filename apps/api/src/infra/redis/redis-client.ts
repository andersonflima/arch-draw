import { createClient } from "redis";

export type AppRedisClient = ReturnType<typeof createClient>;

export const createRedisClient = async (redisUrl: string): Promise<AppRedisClient> => {
  const client = createClient({ url: redisUrl });
  await client.connect();
  return client;
};
