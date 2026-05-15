import initSqlJs, { type Database } from "sql.js";
import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

export type SqliteConnection = Readonly<{
  db: Database;
  persist: () => void;
  close: () => void;
}>;

export const createSqliteConnection = async (
  databasePath: string
): Promise<SqliteConnection> => {
  const resolvedPath = resolve(databasePath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
  const SQL = await initSqlJs({
    locateFile: () => wasmPath
  });
  const db = existsSync(resolvedPath)
    ? new SQL.Database(readFileSync(resolvedPath))
    : new SQL.Database();

  db.exec("PRAGMA foreign_keys = ON;");

  return {
    db,
    persist: () => writeFileSync(resolvedPath, Buffer.from(db.export())),
    close: () => db.close()
  };
};
