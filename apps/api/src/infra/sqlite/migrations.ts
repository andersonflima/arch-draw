import type { SqliteConnection } from "./connection";

export const runMigrations = (connection: SqliteConnection): void => {
  connection.db.exec(`
    CREATE TABLE IF NOT EXISTS architectures (
      id TEXT PRIMARY KEY,
      session_token TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_architectures_updated_at
      ON architectures(updated_at DESC);
  `);

  ensureSessionTokenColumn(connection);
  connection.db.exec(`
    CREATE INDEX IF NOT EXISTS idx_architectures_session_updated_at
      ON architectures(session_token, updated_at DESC);

    CREATE TABLE IF NOT EXISTS architecture_shares (
      share_id TEXT PRIMARY KEY,
      architecture_id TEXT NOT NULL,
      owner_session_token TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_architecture_shares_architecture_owner
      ON architecture_shares(architecture_id, owner_session_token);

    CREATE INDEX IF NOT EXISTS idx_architecture_shares_architecture
      ON architecture_shares(architecture_id);
  `);

  connection.persist();
};

const ensureSessionTokenColumn = (connection: SqliteConnection): void => {
  const columns = connection.db.exec("PRAGMA table_info(architectures);")[0]?.values ?? [];
  const hasSessionToken = columns.some((column) => String(column[1]) === "session_token");
  if (hasSessionToken) return;

  connection.db.exec("ALTER TABLE architectures ADD COLUMN session_token TEXT;");
};
