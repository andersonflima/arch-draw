import type { ArchitectureDocument } from "@arch-draw/domain";
import type {
  ArchitectureRepository,
  ArchitectureSummary
} from "../../application/contracts/architecture-repository";
import type { SqliteConnection } from "./connection";

type ArchitectureRow = Readonly<{
  id: string;
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
    findAll: async () =>
      selectRows(
        connection,
        `
          SELECT id, title, description, document_json, created_at, updated_at
          FROM architectures
          ORDER BY updated_at DESC
        `
      ).map(toSummary),
    findById: async (id) => {
      const row = selectRows(
        connection,
        `
          SELECT id, title, description, document_json, created_at, updated_at
          FROM architectures
          WHERE id = $id
        `,
        { $id: id }
      )[0];

      return row ? parseDocument(row.document_json) : null;
    },
    save: async (architecture) => {
      runStatement(
        connection,
        `
          INSERT INTO architectures (id, title, description, document_json, created_at, updated_at)
          VALUES ($id, $title, $description, $documentJson, $createdAt, $updatedAt)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            document_json = excluded.document_json,
            updated_at = excluded.updated_at
        `,
        {
          $id: architecture.id,
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
    deleteById: async (id) => {
      const existing = selectRows(
        connection,
        `
          SELECT id, title, description, document_json, created_at, updated_at
          FROM architectures
          WHERE id = $id
        `,
        { $id: id }
      )[0];

      if (!existing) return false;

      runStatement(connection, "DELETE FROM architectures WHERE id = $id", { $id: id });
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
