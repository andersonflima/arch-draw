export type AppConfig = Readonly<{
  apiHost: string;
  apiPort: number;
  databasePath: string;
  webOrigins: readonly string[];
  trustProxy: boolean;
  securityMetricsToken?: string;
}>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => ({
  apiHost: env.API_HOST ?? "127.0.0.1",
  apiPort: Number.parseInt(env.API_PORT ?? "3333", 10),
  databasePath: env.DATABASE_PATH ?? "./data/arch-draw.sqlite",
  webOrigins: parseWebOrigins(env.WEB_ORIGINS ?? env.WEB_ORIGIN),
  trustProxy: parseBoolean(env.TRUST_PROXY, false),
  securityMetricsToken: parseOptionalNonEmptyValue(env.SECURITY_METRICS_TOKEN)
});

const parseWebOrigins = (value: string | undefined): readonly string[] =>
  (value ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const parseOptionalNonEmptyValue = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};
