import type { ArchitectureDocument } from "@arch-draw/domain";
import type {
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

export const makeSqliteArchitectureRepository = (
  connection: SqliteConnection
): ArchitectureRepository => {
  return {
    findAll: async (sessionToken) =>
      selectRows(
        connection,
        `
          SELECT id, session_token, title, description, document_json, created_at, updated_at
          FROM architectures
          WHERE session_token = $sessionToken
          ORDER BY updated_at DESC
        `,
        { $sessionToken: sessionToken }
      ).map(toSummary),
    findById: async (id, sessionToken) => {
      const row = selectRows(
        connection,
        `
          SELECT id, session_token, title, description, document_json, created_at, updated_at
          FROM architectures
          WHERE id = $id AND session_token = $sessionToken
        `,
        { $id: id, $sessionToken: sessionToken }
      )[0];

      return row ? parseDocument(row.document_json) : null;
    },
    save: async (architecture, sessionToken) => {
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
    }
  };
};

const toSummary = (row: ArchitectureRow): ArchitectureSummary => {
  const architecture = parseDocument(row.document_json);

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

const parseDocument = (documentJson: string): ArchitectureDocument =>
  JSON.parse(documentJson) as ArchitectureDocument;

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
): void => {
  const statement = connection.db.prepare(sql);

  try {
    statement.run(params);
  } finally {
    statement.free();
  }
};
