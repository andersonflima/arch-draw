import type { ArchitectureDocument } from "@arch-draw/domain";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  ArchitectureRepository,
  ArchitectureShare,
  ArchitectureSummary
} from "../../application/contracts/architecture-repository";
import { decodeCompressedPack, encodeCompressedPack } from "./compressed-pack-codec";
import { middleOutIndices } from "./middle-out";

type ArchitectureStorageRecord = Readonly<{
  type: "architecture";
  id: string;
  sessionToken: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  edgeCount: number;
  document: ArchitectureDocument;
}>;

type ShareStorageRecord = Readonly<{
  type: "share";
  shareId: string;
  architectureId: string;
  ownerSessionToken: string;
  accessMode: "edit" | "read-only";
  createdAt: string;
  updatedAt: string;
}>;

type StorageRecord = ArchitectureStorageRecord | ShareStorageRecord;

type PackIndexEntry = Readonly<{
  fileName: string;
  recordCount: number;
  architectureIds: readonly string[];
  shareIds: readonly string[];
  sessionTokens: readonly string[];
  tokenBloomB64: string;
}>;

type StorageManifest = Readonly<{
  version: 1;
  createdAt: string;
  updatedAt: string;
  packCount: number;
  recordCount: number;
  format: "arch-draw-compressed-v1";
  packIndex: readonly PackIndexEntry[];
  compression: Readonly<{
    inputBytes: number;
    outputBytes: number;
    ratio: number;
    savedBytes: number;
  }>;
}>;

type StoreState = Readonly<{
  records: readonly StorageRecord[];
  manifest: StorageManifest;
}>;

const manifestFileName = "manifest.json";
const packRecordLimit = 1_000;
const compressionLevel = 5;
const queryTokenPattern = /[\p{L}\p{N}_-]+/gu;
const bloomBytes = 256;
const bloomBitSize = bloomBytes * 8;
const bloomSeeds = [0x9e3779b1, 0x85ebca6b, 0xc2b2ae35] as const;

export const makeCompressedArchitectureRepository = (
  storagePath: string
): ArchitectureRepository => {
  const store = createCompressedStore(storagePath);

  return {
    findAll: async (sessionToken) =>
      store
        .readCandidateRecords({ sessionToken })
        .filter(isArchitectureRecord)
        .filter((record) => record.sessionToken === sessionToken)
        .map(toSummary)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),

    findById: async (id, sessionToken) =>
      store
        .findRecord(
          { architectureId: id, sessionToken },
          (record): record is ArchitectureStorageRecord =>
            isArchitectureRecord(record) && record.id === id && record.sessionToken === sessionToken
        )
        ?.document ?? null,

    save: async (architecture, sessionToken) => {
      const state = store.readState();
      const existing = state.records.find(
        (record): record is ArchitectureStorageRecord =>
          isArchitectureRecord(record) && record.id === architecture.id
      );
      const storedArchitecture = existing && existing.sessionToken !== sessionToken
        ? { ...architecture, id: `${architecture.id}-${sessionToken.slice(0, 8)}` }
        : architecture;
      const nextRecord = toArchitectureRecord(storedArchitecture, sessionToken);
      const records = [
        ...state.records.filter(
          (record) => !(isArchitectureRecord(record) && record.id === nextRecord.id && record.sessionToken === sessionToken)
        ),
        nextRecord
      ];

      store.writeRecords(records);
      return storedArchitecture;
    },

    deleteById: async (id, sessionToken) => {
      const state = store.readState();
      const existing = state.records.some(
        (record) => isArchitectureRecord(record) && record.id === id && record.sessionToken === sessionToken
      );
      if (!existing) return false;

      store.writeRecords(
        state.records.filter((record) => {
          if (isArchitectureRecord(record)) {
            return !(record.id === id && record.sessionToken === sessionToken);
          }
          return !(record.architectureId === id && record.ownerSessionToken === sessionToken);
        })
      );
      return true;
    },

    findShareByArchitectureId: async (architectureId, sessionToken, accessMode) =>
      store.findRecord(
        { architectureId, sessionToken },
        (record): record is ShareStorageRecord =>
          isShareRecord(record)
          && record.architectureId === architectureId
          && record.ownerSessionToken === sessionToken
          && record.accessMode === accessMode
      ) ?? null,

    findShareById: async (shareId) =>
      store.findRecord(
        { shareId },
        (record): record is ShareStorageRecord => isShareRecord(record) && record.shareId === shareId
      ) ?? null,

    createShare: async (shareId, architectureId, sessionToken, now, accessMode) => {
      const state = store.readState();
      const architecture = state.records.find(
        (record): record is ArchitectureStorageRecord =>
          isArchitectureRecord(record) && record.id === architectureId && record.sessionToken === sessionToken
      );
      if (!architecture) return null;

      const existingById = state.records.find(
        (record): record is ShareStorageRecord => isShareRecord(record) && record.shareId === shareId
      );
      if (existingById) return toArchitectureShare(existingById);

      const existingByOwner = state.records.find(
        (record): record is ShareStorageRecord =>
          isShareRecord(record)
          && record.architectureId === architectureId
          && record.ownerSessionToken === sessionToken
          && record.accessMode === accessMode
      );
      if (existingByOwner) return toArchitectureShare(existingByOwner);

      const share: ShareStorageRecord = {
        type: "share",
        shareId,
        architectureId,
        ownerSessionToken: sessionToken,
        accessMode,
        createdAt: now,
        updatedAt: now
      };

      store.writeRecords([...state.records, share]);
      return toArchitectureShare(share);
    },

    findByShareId: async (shareId) => {
      const state = store.readState();
      const share = state.records.find(
        (record): record is ShareStorageRecord => isShareRecord(record) && record.shareId === shareId
      );
      if (!share) return null;

      return state.records.find(
        (record): record is ArchitectureStorageRecord =>
          isArchitectureRecord(record) && record.id === share.architectureId
      )?.document ?? null;
    },

    saveByShareId: async (shareId, architecture) => {
      const state = store.readState();
      const share = state.records.find(
        (record): record is ShareStorageRecord => isShareRecord(record) && record.shareId === shareId
      );
      if (!share || share.accessMode !== "edit" || share.architectureId !== architecture.id) return null;

      const existing = state.records.find(
        (record): record is ArchitectureStorageRecord =>
          isArchitectureRecord(record) && record.id === architecture.id
      );
      if (!existing) return null;

      const records = state.records.map((record) => {
        if (isArchitectureRecord(record) && record.id === architecture.id) {
          return toArchitectureRecord(architecture, record.sessionToken);
        }
        if (isShareRecord(record) && record.shareId === shareId) {
          return { ...record, updatedAt: architecture.updatedAt };
        }
        return record;
      });

      store.writeRecords(records);
      return architecture;
    }
  };
};

const createCompressedStore = (storagePath: string) => {
  const directory = resolve(storagePath);
  const manifestPath = join(directory, manifestFileName);

  const ensureDirectory = (): void => {
    mkdirSync(directory, { recursive: true });
  };

  const readManifest = (): StorageManifest | null => {
    try {
      return parseManifest(JSON.parse(readFileSync(manifestPath, "utf8")) as unknown);
    } catch {
      return null;
    }
  };

  const readPackRecords = (fileName: string): readonly StorageRecord[] => {
    try {
      const payload = readFileSync(join(directory, fileName));
      return decodeCompressedPack(payload)
        .toString("utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .flatMap(parseStorageRecord);
    } catch {
      return [];
    }
  };

  const readState = (): StoreState => {
    ensureDirectory();
    const manifest = readManifest();
    if (!manifest) {
      const emptyManifest = writeRecords([]);
      return { records: [], manifest: emptyManifest };
    }

    const records = manifest.packIndex.flatMap((entry) => readPackRecords(entry.fileName));
    return { records, manifest };
  };

  const writeRecords = (records: readonly StorageRecord[]): StorageManifest => {
    ensureDirectory();
    const chunks = chunkRows(sortRecords(records), packRecordLimit);
    const currentManifest = readManifest();
    for (const entry of currentManifest?.packIndex ?? []) {
      rmSync(join(directory, entry.fileName), { force: true });
    }

    let inputBytes = 0;
    let outputBytes = 0;
    const packIndex: PackIndexEntry[] = [];

    chunks.forEach((chunk, index) => {
      const fileName = `pack-${String(index + 1).padStart(4, "0")}.adpk`;
      const serialized = `${chunk.map((record) => JSON.stringify(record)).join("\n")}\n`;
      const compressed = encodeCompressedPack(Buffer.from(serialized, "utf8"), {
        compressionLevel,
        useDictionary: true
      });

      writeFileSync(join(directory, fileName), compressed);
      inputBytes += Buffer.byteLength(serialized, "utf8");
      outputBytes += compressed.byteLength;
      packIndex.push(toPackIndexEntry(fileName, chunk));
    });

    const now = new Date().toISOString();
    const manifest: StorageManifest = {
      version: 1,
      createdAt: currentManifest?.createdAt ?? now,
      updatedAt: now,
      packCount: chunks.length,
      recordCount: records.length,
      format: "arch-draw-compressed-v1",
      packIndex,
      compression: {
        inputBytes,
        outputBytes,
        ratio: outputBytes / Math.max(inputBytes, 1),
        savedBytes: Math.max(inputBytes - outputBytes, 0)
      }
    };

    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return manifest;
  };

  const selectCandidatePackFiles = (
    manifest: StorageManifest,
    query: Readonly<{
      architectureId?: string;
      shareId?: string;
      sessionToken?: string;
      tokens?: readonly string[];
    }>
  ): readonly string[] => {
    const tokens = query.tokens ?? [];
    const byMetadata = manifest.packIndex.filter((entry) => {
      if (query.architectureId && !entry.architectureIds.includes(query.architectureId)) return false;
      if (query.shareId && !entry.shareIds.includes(query.shareId)) return false;
      if (query.sessionToken && !entry.sessionTokens.includes(query.sessionToken)) return false;
      if (tokens.length === 0) return true;

      const bloom = bloomFromBase64(entry.tokenBloomB64);
      return tokens.some((token) => bloomMayContain(bloom, token));
    });

    return (byMetadata.length > 0 ? byMetadata : manifest.packIndex).map((entry) => entry.fileName);
  };

  const readCandidateRecords = (
    query: Readonly<{
      architectureId?: string;
      shareId?: string;
      sessionToken?: string;
      tokens?: readonly string[];
    }>
  ): readonly StorageRecord[] => {
    const manifest = readManifest();
    if (!manifest) return [];

    return selectCandidatePackFiles(manifest, query)
      .flatMap(readPackRecords);
  };

  const findRecord = <T extends StorageRecord>(
    query: Readonly<{
      architectureId?: string;
      shareId?: string;
      sessionToken?: string;
      tokens?: readonly string[];
    }>,
    predicate: (record: StorageRecord) => record is T
  ): T | null => {
    const manifest = readManifest();
    if (!manifest) return null;

    for (const fileName of selectCandidatePackFiles(manifest, query)) {
      const records = readPackRecords(fileName);
      const traversal = middleOutIndices(records.length, Math.floor(records.length / 2));
      for (const index of traversal) {
        const record = records[index];
        if (record && predicate(record)) return record;
      }
    }

    return null;
  };

  return {
    readState,
    writeRecords,
    readCandidateRecords,
    findRecord
  };
};

const toArchitectureRecord = (
  architecture: ArchitectureDocument,
  sessionToken: string
): ArchitectureStorageRecord => ({
  type: "architecture",
  id: architecture.id,
  sessionToken,
  title: architecture.title,
  description: architecture.description,
  createdAt: architecture.createdAt,
  updatedAt: architecture.updatedAt,
  nodeCount: architecture.nodes.length,
  edgeCount: architecture.edges.length,
  document: architecture
});

const toSummary = (record: ArchitectureStorageRecord): ArchitectureSummary => ({
  id: record.id,
  title: record.title,
  description: record.description,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  nodeCount: record.nodeCount,
  edgeCount: record.edgeCount
});

const toArchitectureShare = (record: ShareStorageRecord): ArchitectureShare => ({
  shareId: record.shareId,
  architectureId: record.architectureId,
  accessMode: record.accessMode,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt
});

const isArchitectureRecord = (record: StorageRecord): record is ArchitectureStorageRecord =>
  record.type === "architecture";

const isShareRecord = (record: StorageRecord): record is ShareStorageRecord =>
  record.type === "share";

const parseStorageRecord = (value: string): readonly StorageRecord[] => {
  try {
    const parsed = JSON.parse(value) as Partial<StorageRecord>;
    if (parsed.type === "architecture" && isArchitectureDocument(parsed.document)) {
      return [
        {
          type: "architecture",
          id: parsed.id ?? parsed.document.id,
          sessionToken: parsed.sessionToken ?? "",
          title: parsed.title ?? parsed.document.title,
          description: parsed.description ?? parsed.document.description,
          createdAt: parsed.createdAt ?? parsed.document.createdAt,
          updatedAt: parsed.updatedAt ?? parsed.document.updatedAt,
          nodeCount: typeof parsed.nodeCount === "number" ? parsed.nodeCount : parsed.document.nodes.length,
          edgeCount: typeof parsed.edgeCount === "number" ? parsed.edgeCount : parsed.document.edges.length,
          document: parsed.document
        }
      ];
    }

    if (
      parsed.type === "share"
      && typeof parsed.shareId === "string"
      && typeof parsed.architectureId === "string"
      && typeof parsed.ownerSessionToken === "string"
      && (parsed.accessMode === "edit" || parsed.accessMode === "read-only")
      && typeof parsed.createdAt === "string"
      && typeof parsed.updatedAt === "string"
    ) {
      return [parsed as ShareStorageRecord];
    }
  } catch {
    return [];
  }

  return [];
};

const isArchitectureDocument = (value: unknown): value is ArchitectureDocument => {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<ArchitectureDocument>;
  return (
    typeof document.id === "string"
    && typeof document.title === "string"
    && typeof document.description === "string"
    && typeof document.createdAt === "string"
    && typeof document.updatedAt === "string"
    && Array.isArray(document.nodes)
    && Array.isArray(document.edges)
  );
};

const parseManifest = (value: unknown): StorageManifest | null => {
  if (!value || typeof value !== "object") return null;
  const manifest = value as Partial<StorageManifest>;
  if (manifest.version !== 1 || manifest.format !== "arch-draw-compressed-v1") return null;
  if (!Array.isArray(manifest.packIndex)) return null;

  return {
    version: 1,
    createdAt: typeof manifest.createdAt === "string" ? manifest.createdAt : new Date().toISOString(),
    updatedAt: typeof manifest.updatedAt === "string" ? manifest.updatedAt : new Date().toISOString(),
    packCount: typeof manifest.packCount === "number" ? manifest.packCount : manifest.packIndex.length,
    recordCount: typeof manifest.recordCount === "number" ? manifest.recordCount : 0,
    format: "arch-draw-compressed-v1",
    packIndex: manifest.packIndex.flatMap(parsePackIndexEntry),
    compression: {
      inputBytes: manifest.compression?.inputBytes ?? 0,
      outputBytes: manifest.compression?.outputBytes ?? 0,
      ratio: manifest.compression?.ratio ?? 0,
      savedBytes: manifest.compression?.savedBytes ?? 0
    }
  };
};

const parsePackIndexEntry = (value: unknown): readonly PackIndexEntry[] => {
  if (!value || typeof value !== "object") return [];
  const entry = value as Partial<PackIndexEntry>;
  if (typeof entry.fileName !== "string") return [];

  return [
    {
      fileName: entry.fileName,
      recordCount: typeof entry.recordCount === "number" ? entry.recordCount : 0,
      architectureIds: stringArray(entry.architectureIds),
      shareIds: stringArray(entry.shareIds),
      sessionTokens: stringArray(entry.sessionTokens),
      tokenBloomB64: typeof entry.tokenBloomB64 === "string" ? entry.tokenBloomB64 : bloomToBase64(createBloom())
    }
  ];
};

const stringArray = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const sortRecords = (records: readonly StorageRecord[]): readonly StorageRecord[] =>
  [...records].sort((left, right) => {
    const typeOrder = left.type.localeCompare(right.type);
    if (typeOrder !== 0) return typeOrder;
    const leftId = left.type === "architecture" ? left.id : left.shareId;
    const rightId = right.type === "architecture" ? right.id : right.shareId;
    return leftId.localeCompare(rightId);
  });

const chunkRows = <T>(rows: readonly T[], size: number): readonly (readonly T[])[] => {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
};

const toPackIndexEntry = (fileName: string, records: readonly StorageRecord[]): PackIndexEntry => ({
  fileName,
  recordCount: records.length,
  architectureIds: uniqueSorted(records.flatMap((record) => record.type === "architecture" ? [record.id] : [record.architectureId])),
  shareIds: uniqueSorted(records.flatMap((record) => record.type === "share" ? [record.shareId] : [])),
  sessionTokens: uniqueSorted(
    records.flatMap((record) => record.type === "architecture" ? [record.sessionToken] : [record.ownerSessionToken])
  ),
  tokenBloomB64: bloomToBase64(bloomFromRecords(records))
});

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  Array.from(new Set(values.filter((value) => value.length > 0))).sort((left, right) => left.localeCompare(right));

const normalizeToken = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const tokenize = (query: string): readonly string[] =>
  query
    .match(queryTokenPattern)
    ?.map(normalizeToken)
    .filter((token) => token.length > 1) ?? [];

const hashToken = (token: string, seed: number): number => {
  let hash = seed >>> 0;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
};

const createBloom = (): Uint8Array => new Uint8Array(bloomBytes);

const bloomAdd = (bloom: Uint8Array, token: string): void => {
  bloomSeeds.forEach((seed) => {
    const bit = hashToken(token, seed) % bloomBitSize;
    const byteIndex = Math.floor(bit / 8);
    bloom[byteIndex] = (bloom[byteIndex] ?? 0) | (1 << (bit % 8));
  });
};

const bloomMayContain = (bloom: Uint8Array, token: string): boolean =>
  bloomSeeds.every((seed) => {
    const bit = hashToken(token, seed) % bloomBitSize;
    const byteIndex = Math.floor(bit / 8);
    return ((bloom[byteIndex] ?? 0) & (1 << (bit % 8))) !== 0;
  });

const bloomFromRecords = (records: readonly StorageRecord[]): Uint8Array => {
  const bloom = createBloom();
  records.forEach((record) => {
    const text = record.type === "architecture"
      ? [record.id, record.sessionToken, record.title, record.description, JSON.stringify(record.document)].join(" ")
      : [record.shareId, record.architectureId, record.ownerSessionToken, record.accessMode].join(" ");
    tokenize(text).forEach((token) => bloomAdd(bloom, token));
  });
  return bloom;
};

const bloomToBase64 = (bloom: Uint8Array): string =>
  Buffer.from(bloom).toString("base64url");

const bloomFromBase64 = (value: string): Uint8Array => {
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.byteLength === bloomBytes) return new Uint8Array(decoded);
  } catch {
    return createBloom();
  }
  return createBloom();
};
