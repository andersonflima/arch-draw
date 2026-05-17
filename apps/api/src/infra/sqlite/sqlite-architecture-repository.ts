import type { ArchitectureDocument } from "@arch-draw/domain";
import type {
  ArchitectureShare,
  ArchitectureRepository,
  ArchitectureSummary
} from "../../application/contracts/architecture-repository";
import type { SqliteConnection } from "./connection";

type ArchitectureRow = Readonly<{
  id: string;
  session_token?: string | null;
  title: string;
  description: string;
  document_json: string;
  created_at: string;
  updated_at: string;
}>;

type ArchitectureShareRow = Readonly<{
  share_id: string;
  architecture_id: string;
  owner_session_token: string;
  created_at: string;
  updated_at: string;
}>;

export const makeSqliteArchitectureRepository = (
  connection: SqliteConnection
): ArchitectureRepository => {
  return {
    findAll: async (sessionToken) => {
      claimLegacyRows(connection, sessionToken);

      return selectRows(
        connection,
        `
          SELECT id, session_token, title, description, document_json, created_at, updated_at
          FROM architectures
          WHERE session_token = $sessionToken
          ORDER BY updated_at DESC
        `,
        { $sessionToken: sessionToken }
      )
        .map(toSummary)
        .filter((summary): summary is ArchitectureSummary => summary !== null);
    },
    findById: async (id, sessionToken) => {
      claimLegacyRows(connection, sessionToken);

      const row = selectRows(
        connection,
        `
          SELECT id, session_token, title, description, document_json, created_at, updated_at
          FROM architectures
          WHERE id = $id AND session_token = $sessionToken
        `,
        { $id: id, $sessionToken: sessionToken }
      )[0];

      if (!row) return null;
      return parseDocument(row.document_json);
    },
    save: async (architecture, sessionToken) => {
      claimLegacyRows(connection, sessionToken);

      const existing = selectRows(
        connection,
        `
          SELECT id, session_token, title, description, document_json, created_at, updated_at
          FROM architectures
          WHERE id = $id
        `,
        { $id: architecture.id }
      )[0];

      if (existing && existing.session_token !== sessionToken) {
        const duplicatedId = `${architecture.id}-${sessionToken.slice(0, 8)}`;
        architecture = { ...architecture, id: duplicatedId };
      }

      runStatement(
        connection,
        `
          INSERT INTO architectures (id, session_token, title, description, document_json, created_at, updated_at)
          VALUES ($id, $sessionToken, $title, $description, $documentJson, $createdAt, $updatedAt)
          ON CONFLICT(id) DO UPDATE SET
            session_token = excluded.session_token,
            title = excluded.title,
            description = excluded.description,
            document_json = excluded.document_json,
            updated_at = excluded.updated_at
          WHERE architectures.session_token = excluded.session_token
        `,
        {
          $id: architecture.id,
          $sessionToken: sessionToken,
          $title: architecture.title,
          $description: architecture.description,
          $documentJson: JSON.stringify(architecture),
          $createdAt: architecture.createdAt,
          $updatedAt: architecture.updatedAt
        }
      );
      connection.persist();

      return architecture;
    },
    deleteById: async (id, sessionToken) => {
      claimLegacyRows(connection, sessionToken);

      const existing = selectRows(
        connection,
        `
          SELECT id, session_token, title, description, document_json, created_at, updated_at
          FROM architectures
          WHERE id = $id AND session_token = $sessionToken
        `,
        { $id: id, $sessionToken: sessionToken }
      )[0];

      if (!existing) return false;

      runStatement(
        connection,
        "DELETE FROM architectures WHERE id = $id AND session_token = $sessionToken",
        { $id: id, $sessionToken: sessionToken }
      );
      connection.persist();
      return true;
    },
    findShareByArchitectureId: async (architectureId, sessionToken) => {
      const row = selectShareRows(
        connection,
        `
          SELECT share_id, architecture_id, owner_session_token, created_at, updated_at
          FROM architecture_shares
          WHERE architecture_id = $architectureId AND owner_session_token = $sessionToken
          LIMIT 1
        `,
        {
          $architectureId: architectureId,
          $sessionToken: sessionToken
        }
      )[0];
      if (!row) return null;
      return toArchitectureShare(row);
    },
    createShare: async (shareId, architectureId, sessionToken, now) => {
      const architecture = selectRows(
        connection,
        `
          SELECT id, session_token, title, description, document_json, created_at, updated_at
          FROM architectures
          WHERE id = $architectureId AND session_token = $sessionToken
          LIMIT 1
        `,
        {
          $architectureId: architectureId,
          $sessionToken: sessionToken
        }
      )[0];
      if (!architecture) return null;

      runStatement(
        connection,
        `
          INSERT OR IGNORE INTO architecture_shares (share_id, architecture_id, owner_session_token, created_at, updated_at)
          VALUES ($shareId, $architectureId, $sessionToken, $now, $now)
        `,
        {
          $shareId: shareId,
          $architectureId: architectureId,
          $sessionToken: sessionToken,
          $now: now
        }
      );

      const row = selectShareRows(
        connection,
        `
          SELECT share_id, architecture_id, owner_session_token, created_at, updated_at
          FROM architecture_shares
          WHERE share_id = $shareId
          LIMIT 1
        `,
        { $shareId: shareId }
      )[0];
      if (!row) return null;
      connection.persist();
      return toArchitectureShare(row);
    },
    findByShareId: async (shareId) => {
      const row = selectRows(
        connection,
        `
          SELECT a.id, a.session_token, a.title, a.description, a.document_json, a.created_at, a.updated_at
          FROM architecture_shares s
          JOIN architectures a ON a.id = s.architecture_id
          WHERE s.share_id = $shareId
          LIMIT 1
        `,
        { $shareId: shareId }
      )[0];
      if (!row) return null;
      return parseDocument(row.document_json);
    },
    saveByShareId: async (shareId, architecture) => {
      const shareRow = selectShareRows(
        connection,
        `
          SELECT share_id, architecture_id, owner_session_token, created_at, updated_at
          FROM architecture_shares
          WHERE share_id = $shareId
          LIMIT 1
        `,
        { $shareId: shareId }
      )[0];
      if (!shareRow) return null;
      if (shareRow.architecture_id !== architecture.id) return null;

      runStatement(
        connection,
        `
          UPDATE architectures
          SET title = $title,
              description = $description,
              document_json = $documentJson,
              updated_at = $updatedAt
          WHERE id = $id
        `,
        {
          $id: architecture.id,
          $title: architecture.title,
          $description: architecture.description,
          $documentJson: JSON.stringify(architecture),
          $updatedAt: architecture.updatedAt
        }
      );

      runStatement(
        connection,
        `
          UPDATE architecture_shares
          SET updated_at = $updatedAt
          WHERE share_id = $shareId
        `,
        {
          $shareId: shareId,
          $updatedAt: architecture.updatedAt
        }
      );
      connection.persist();
      return architecture;
    }
  };
};

const claimLegacyRows = (connection: SqliteConnection, sessionToken: string): void => {
  const modifiedRows = runStatement(
    connection,
    `
      UPDATE architectures
      SET session_token = $sessionToken
      WHERE session_token IS NULL
    `,
    { $sessionToken: sessionToken }
  );
  if (modifiedRows > 0) {
    connection.persist();
  }
};

const toSummary = (row: ArchitectureRow): ArchitectureSummary | null => {
  const architecture = parseDocument(row.document_json);
  if (!architecture) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nodeCount: architecture.nodes.length,
    edgeCount: architecture.edges.length
  };
};

const toArchitectureShare = (row: ArchitectureShareRow): ArchitectureShare => ({
  shareId: row.share_id,
  architectureId: row.architecture_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const parseDocument = (documentJson: string): ArchitectureDocument | null => {
  try {
    const parsed = JSON.parse(documentJson) as ArchitectureDocument;
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
};

const selectRows = (
  connection: SqliteConnection,
  sql: string,
  params: Record<string, string> = {}
): readonly ArchitectureRow[] => {
  const statement = connection.db.prepare(sql);
  const rows: ArchitectureRow[] = [];

  try {
    statement.bind(params);
    while (statement.step()) {
      rows.push(statement.getAsObject() as ArchitectureRow);
    }
    return rows;
  } finally {
    statement.free();
  }
};

const runStatement = (
  connection: SqliteConnection,
  sql: string,
  params: Record<string, string>
): number => {
  const statement = connection.db.prepare(sql);

  try {
    statement.run(params);
    return connection.db.getRowsModified();
  } finally {
    statement.free();
  }
};

const selectShareRows = (
  connection: SqliteConnection,
  sql: string,
  params: Record<string, string> = {}
): readonly ArchitectureShareRow[] => {
  const statement = connection.db.prepare(sql);
  const rows: ArchitectureShareRow[] = [];

  try {
    statement.bind(params);
    while (statement.step()) {
      rows.push(statement.getAsObject() as ArchitectureShareRow);
    }
    return rows;
  } finally {
    statement.free();
  }
};
