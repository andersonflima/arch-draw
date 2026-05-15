export type AppConfig = Readonly<{
  apiHost: string;
  apiPort: number;
  databasePath: string;
  webOrigins: readonly string[];
}>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => ({
  apiHost: env.API_HOST ?? "127.0.0.1",
  apiPort: Number.parseInt(env.API_PORT ?? "3333", 10),
  databasePath: env.DATABASE_PATH ?? "./data/arch-draw.sqlite",
  webOrigins: parseWebOrigins(env.WEB_ORIGINS ?? env.WEB_ORIGIN)
});

const parseWebOrigins = (value: string | undefined): readonly string[] =>
  (value ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
