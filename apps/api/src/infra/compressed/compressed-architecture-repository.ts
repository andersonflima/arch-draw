import type { ArchitectureDocument } from "@arch-draw/domain";
import { migrateArchitectureDocument } from "@arch-draw/domain";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  ArchitectureRepository,
  ArchitectureShare,
  ArchitectureSummary
} from "../../application/contracts/architecture-repository";
import { decodeCompressedPack, encodeCompressedPack, packUsesDictionary } from "./compressed-pack-codec";
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
  // Hash of the pack's serialized content; lets writes skip re-compressing and
  // rewriting packs whose records did not change. Optional for older manifests.
  contentHash?: string;
  compressedBytes?: number;
}>;

type StorageManifest = Readonly<{
  version: 1;
  createdAt: string;
  updatedAt: string;
  packCount: number;
  recordCount: number;
  format: "arch-draw-compressed-v1";
  packIndex: readonly PackIndexEntry[];
  // True once every pack was written in the portable (dictionary-free) format.
  // Absent/false on stores written by older builds, which triggers a one-time migration.
  dictionaryFree?: boolean;
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
      (await store.readCandidateRecords({ sessionToken }))
        .filter(isArchitectureRecord)
        .filter((record) => record.sessionToken === sessionToken)
        .map(toSummary)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),

    findById: async (id, sessionToken) =>
      (await store
        .findRecord(
          { architectureId: id, sessionToken },
          (record): record is ArchitectureStorageRecord =>
            isArchitectureRecord(record) && record.id === id && record.sessionToken === sessionToken
        ))
        ?.document ?? null,

    save: async (architecture, sessionToken) => {
      const state = await store.readState();
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

      await store.writeRecords(records);
      return storedArchitecture;
    },

    deleteById: async (id, sessionToken) => {
      const state = await store.readState();
      const existing = state.records.some(
        (record) => isArchitectureRecord(record) && record.id === id && record.sessionToken === sessionToken
      );
      if (!existing) return false;

      await store.writeRecords(
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
      await store.findRecord(
        { architectureId, sessionToken },
        (record): record is ShareStorageRecord =>
          isShareRecord(record)
          && record.architectureId === architectureId
          && record.ownerSessionToken === sessionToken
          && record.accessMode === accessMode
      ) ?? null,

    findShareById: async (shareId) =>
      await store.findRecord(
        { shareId },
        (record): record is ShareStorageRecord => isShareRecord(record) && record.shareId === shareId
      ) ?? null,

    createShare: async (shareId, architectureId, sessionToken, now, accessMode) => {
      const state = await store.readState();
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

      await store.writeRecords([...state.records, share]);
      return toArchitectureShare(share);
    },

    findByShareId: async (shareId) => {
      const state = await store.readState();
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
      const state = await store.readState();
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

      await store.writeRecords(records);
      return architecture;
    }
  };
};

const createCompressedStore = (storagePath: string) => {
  const directory = resolve(storagePath);
  const manifestPath = join(directory, manifestFileName);
  let manifestCache: StorageManifest | null = null;
  const packRecordsCache = new Map<string, readonly StorageRecord[]>();
  const maxCachedPacks = 24;
  let dictionaryMigrationChecked = false;

  const ensureDirectory = (): void => {
    mkdirSync(directory, { recursive: true });
  };

  // Crash-safe write: stream into a sibling temp file, then atomically rename it
  // over the target. On POSIX rename within the same directory is atomic, so a
  // reader never observes a half-written pack or a truncated manifest.
  const writeFileAtomic = async (filePath: string, data: string | Buffer): Promise<void> => {
    const tempPath = `${filePath}.tmp-${randomUUID()}`;
    try {
      await writeFile(tempPath, data);
      await rename(tempPath, filePath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  };

  const readManifest = async (): Promise<StorageManifest | null> => {
    if (manifestCache) return manifestCache;
    let rawManifest: string;
    try {
      rawManifest = await readFile(manifestPath, "utf8");
    } catch (error) {
      // A genuinely absent manifest means an empty store; any other I/O failure
      // must surface rather than be mistaken for "no data".
      if (isFileNotFound(error)) return null;
      throw error;
    }

    let parsed: StorageManifest | null = null;
    try {
      parsed = parseManifest(JSON.parse(rawManifest) as unknown);
    } catch {
      parsed = null;
    }
    // A present-but-unreadable manifest is corruption, not emptiness. Refuse to
    // proceed so the caller never resets a populated store to an empty one.
    if (!parsed) {
      throw new Error(`Refusing to treat a corrupt manifest as an empty store: ${manifestPath}`);
    }

    manifestCache = parsed;
    return migrateDictionaryPacksIfNeeded(parsed);
  };

  // One-time migration: a store written by an older build may hold packs in the
  // non-portable dictionary format. The running Node version can still decode them,
  // so rewrite the store in the portable, dictionary-free format while it still can —
  // before a future Node upgrade could make those diagrams unreadable. Guarded so it
  // runs at most once per process and is a no-op for already-portable stores.
  const migrateDictionaryPacksIfNeeded = async (
    manifest: StorageManifest
  ): Promise<StorageManifest> => {
    if (manifest.dictionaryFree || dictionaryMigrationChecked) return manifest;
    dictionaryMigrationChecked = true;
    if (!(await anyPackUsesDictionary(manifest))) return manifest;
    const packRecords = await Promise.all(
      manifest.packIndex.map((entry) => readPackRecords(entry.fileName))
    );
    return writeRecords(packRecords.flat());
  };

  const anyPackUsesDictionary = async (manifest: StorageManifest): Promise<boolean> => {
    for (const entry of manifest.packIndex) {
      try {
        if (packUsesDictionary(await readFile(join(directory, entry.fileName)))) return true;
      } catch {
        // Unreadable pack: leave it for the normal read path to surface.
      }
    }
    return false;
  };

  const readPackRecords = async (fileName: string): Promise<readonly StorageRecord[]> => {
    const cached = packRecordsCache.get(fileName);
    if (cached) {
      // LRU: renew recency by reinserting key.
      packRecordsCache.delete(fileName);
      packRecordsCache.set(fileName, cached);
      return cached;
    }

    try {
      const payload = await readFile(join(directory, fileName));
      const records = decodeCompressedPack(payload)
        .toString("utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .flatMap(parseStorageRecord);
      packRecordsCache.set(fileName, records);
      if (packRecordsCache.size > maxCachedPacks) {
        const oldestKey = packRecordsCache.keys().next().value;
        if (typeof oldestKey === "string") {
          packRecordsCache.delete(oldestKey);
        }
      }
      return records;
    } catch {
      return [];
    }
  };

  const readState = async (): Promise<StoreState> => {
    ensureDirectory();
    const manifest = await readManifest();
    if (!manifest) {
      const emptyManifest = await writeRecords([]);
      return { records: [], manifest: emptyManifest };
    }

    const packRecords = await Promise.all(
      manifest.packIndex.map((entry) => readPackRecords(entry.fileName))
    );
    const records = packRecords.flat();
    return { records, manifest };
  };

  const writeRecords = async (records: readonly StorageRecord[]): Promise<StorageManifest> => {
    ensureDirectory();
    const chunks = chunkRows(sortRecords(records), packRecordLimit);
    const currentManifest = await readManifest();
    const existingByFile = new Map(
      (currentManifest?.packIndex ?? []).map((entry) => [entry.fileName, entry] as const)
    );

    let inputBytes = 0;
    let outputBytes = 0;
    const packIndex: PackIndexEntry[] = [];
    const retainedFiles = new Set<string>();

    for (const [index, chunk] of chunks.entries()) {
      const fileName = `pack-${String(index + 1).padStart(4, "0")}.adpk`;
      retainedFiles.add(fileName);
      const serialized = `${chunk.map((record) => JSON.stringify(record)).join("\n")}\n`;
      const serializedBytes = Buffer.byteLength(serialized, "utf8");
      const contentHash = createHash("sha256").update(serialized).digest("hex");
      const existing = existingByFile.get(fileName);

      // Reuse a pack untouched on disk when its serialized records are byte-identical:
      // the dominant cost (zstd compression + the disk write) is skipped entirely.
      if (
        existing?.contentHash === contentHash
        && existing.compressedBytes !== undefined
        && existsSync(join(directory, fileName))
      ) {
        // Identical serialized records => identical metadata; reuse the index entry.
        packIndex.push(existing);
        inputBytes += serializedBytes;
        outputBytes += existing.compressedBytes;
        packRecordsCache.set(fileName, chunk);
        continue;
      }

      // Portable, dictionary-free encoding (see compressed-pack-codec).
      const compressed = encodeCompressedPack(Buffer.from(serialized, "utf8"), {
        compressionLevel,
        useDictionary: false
      });

      await writeFileAtomic(join(directory, fileName), compressed);
      inputBytes += serializedBytes;
      outputBytes += compressed.byteLength;
      packIndex.push({ ...toPackIndexEntry(fileName, chunk), contentHash, compressedBytes: compressed.byteLength });
      packRecordsCache.set(fileName, chunk);
    }

    // Keep the pack cache bounded after directly seeding it above.
    while (packRecordsCache.size > maxCachedPacks) {
      const oldestKey = packRecordsCache.keys().next().value;
      if (typeof oldestKey !== "string") break;
      packRecordsCache.delete(oldestKey);
    }

    const now = new Date().toISOString();
    const manifest: StorageManifest = {
      version: 1,
      createdAt: currentManifest?.createdAt ?? now,
      updatedAt: now,
      packCount: chunks.length,
      recordCount: records.length,
      format: "arch-draw-compressed-v1",
      packIndex,
      dictionaryFree: true,
      compression: {
        inputBytes,
        outputBytes,
        ratio: outputBytes / Math.max(inputBytes, 1),
        savedBytes: Math.max(inputBytes - outputBytes, 0)
      }
    };

    // Commit point: write the manifest last and atomically. Until this succeeds
    // the previous manifest still describes a fully consistent store.
    await writeFileAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    manifestCache = manifest;

    // Only after the new manifest is committed do we drop packs it no longer
    // references. A crash here leaves unreferenced files behind (harmless garbage,
    // reclaimed on the next write), never a manifest pointing at a missing pack.
    for (const entry of currentManifest?.packIndex ?? []) {
      if (!retainedFiles.has(entry.fileName)) {
        await rm(join(directory, entry.fileName), { force: true });
        packRecordsCache.delete(entry.fileName);
      }
    }

    // The pack cache was kept in sync above (changed packs reseeded, removed packs
    // evicted), so a follow-up read no longer has to re-decompress the whole store.
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

  const readCandidateRecords = async (
    query: Readonly<{
      architectureId?: string;
      shareId?: string;
      sessionToken?: string;
      tokens?: readonly string[];
    }>
  ): Promise<readonly StorageRecord[]> => {
    const manifest = await readManifest();
    if (!manifest) return [];

    const packs = await Promise.all(
      selectCandidatePackFiles(manifest, query).map((fileName) => readPackRecords(fileName))
    );
    return packs.flat();
  };

  const findRecord = async <T extends StorageRecord>(
    query: Readonly<{
      architectureId?: string;
      shareId?: string;
      sessionToken?: string;
      tokens?: readonly string[];
    }>,
    predicate: (record: StorageRecord) => record is T
  ): Promise<T | null> => {
    const manifest = await readManifest();
    if (!manifest) return null;

    for (const fileName of selectCandidatePackFiles(manifest, query)) {
      const records = await readPackRecords(fileName);
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
          // Migrate stored documents to the current schema on read so older v1
          // records are returned to clients (and re-persisted) as the current version.
          document: migrateArchitectureDocument(parsed.document)
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

const isFileNotFound = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";

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
    ...(manifest.dictionaryFree === true ? { dictionaryFree: true } : {}),
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
  // Constrain the manifest-supplied file name to the generated naming scheme so a
  // tampered manifest cannot drive arbitrary-path reads or deletes (path traversal).
  if (typeof entry.fileName !== "string" || !/^pack-\d{4,}\.adpk$/.test(entry.fileName)) return [];

  return [
    {
      fileName: entry.fileName,
      recordCount: typeof entry.recordCount === "number" ? entry.recordCount : 0,
      architectureIds: stringArray(entry.architectureIds),
      shareIds: stringArray(entry.shareIds),
      sessionTokens: stringArray(entry.sessionTokens),
      tokenBloomB64: typeof entry.tokenBloomB64 === "string" ? entry.tokenBloomB64 : bloomToBase64(createBloom()),
      ...(typeof entry.contentHash === "string" ? { contentHash: entry.contentHash } : {}),
      ...(typeof entry.compressedBytes === "number" ? { compressedBytes: entry.compressedBytes } : {})
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
