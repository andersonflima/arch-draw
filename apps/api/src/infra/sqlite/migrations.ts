import type { SqliteConnection } from "./connection";

export const runMigrations = (connection: SqliteConnection): void => {
  connection.db.exec(`
    CREATE TABLE IF NOT EXISTS architectures (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_architectures_updated_at
      ON architectures(updated_at DESC);
  `);
  connection.persist();
};
