import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";

export const loadDotEnvFile = (
  options: Readonly<{
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  }> = {}
): void => {
  const env = options.env ?? process.env;
  const filePath = findDotEnvFile(options.cwd ?? process.cwd());
  if (!filePath) return;

  const entries = parseDotEnv(readFileSync(filePath, "utf8"));
  for (const [key, value] of entries) {
    if (env[key] === undefined) env[key] = value;
  }
};

export const parseDotEnv = (source: string): ReadonlyMap<string, string> => {
  const entries = new Map<string, string>();
  for (const line of source.split(/\r?\n/g)) {
    const parsed = parseDotEnvLine(line);
    if (parsed) entries.set(parsed.key, parsed.value);
  }
  return entries;
};

const findDotEnvFile = (cwd: string): string | null => {
  let current = cwd;
  while (true) {
    const candidate = join(current, ".env");
    if (existsSync(candidate)) return candidate;

    const parent = dirname(current);
    if (parent === current || parse(current).root === current) return null;
    current = parent;
  }
};

const parseDotEnvLine = (line: string): Readonly<{ key: string; value: string }> | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const separator = trimmed.indexOf("=");
  if (separator <= 0) return null;

  const key = trimmed.slice(0, separator).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  const rawValue = trimmed.slice(separator + 1).trim();
  return { key, value: unquoteValue(rawValue) };
};

const unquoteValue = (value: string): string => {
  if (value.length < 2) return value;
  const quote = value[0];
  if ((quote !== "\"" && quote !== "'") || value[value.length - 1] !== quote) return value;
  const inner = value.slice(1, -1);
  return quote === "\"" ? inner.replace(/\\n/g, "\n").replace(/\\"/g, "\"") : inner;
};
