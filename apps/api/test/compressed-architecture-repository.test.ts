import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { createEmptyArchitecture, type ArchitectureDocument } from "@arch-draw/domain";
import { makeCompressedArchitectureRepository } from "../src/infra/compressed/compressed-architecture-repository";
import {
  decodeCompressedPack,
  encodeCompressedPack,
  packUsesDictionary
} from "../src/infra/compressed/compressed-pack-codec";

describe("compressed architecture repository", () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (!tempDir) return;
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  it("persists records in compressed packs and preserves session/share behavior", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "arch-draw-compressed-repository-"));
    const storagePath = join(tempDir, "architectures.store");
    const repository = makeCompressedArchitectureRepository(storagePath);

    const sessionA = "session-a";
    const sessionB = "session-b";
    const createdAt = "2026-05-18T10:00:00.000Z";
    const architectureA = withUpdatedAt(
      createEmptyArchitecture({
        id: "diagram-a",
        title: "Service with TypeScript code",
        description: "Contains API, cache and repository nodes",
        now: createdAt
      }),
      "2026-05-18T10:01:00.000Z"
    );
    const architectureB = createEmptyArchitecture({
      id: "diagram-b",
      title: "Other session",
      now: "2026-05-18T10:02:00.000Z"
    });

    await repository.save(architectureA, sessionA);
    await repository.save(architectureB, sessionB);

    expect(await repository.findById("diagram-a", sessionA)).toEqual(architectureA);
    expect(await repository.findById("diagram-a", sessionB)).toBeNull();
    expect(await repository.findAll(sessionA)).toEqual([
      {
        id: "diagram-a",
        title: "Service with TypeScript code",
        description: "Contains API, cache and repository nodes",
        createdAt,
        updatedAt: "2026-05-18T10:01:00.000Z",
        nodeCount: 0,
        edgeCount: 0
      }
    ]);

    const share = await repository.createShare(
      "share-edit",
      "diagram-a",
      sessionA,
      "2026-05-18T10:03:00.000Z",
      "edit"
    );
    expect(share).toEqual({
      shareId: "share-edit",
      architectureId: "diagram-a",
      accessMode: "edit",
      createdAt: "2026-05-18T10:03:00.000Z",
      updatedAt: "2026-05-18T10:03:00.000Z"
    });

    const edited = withUpdatedAt(architectureA, "2026-05-18T10:04:00.000Z");
    expect(await repository.saveByShareId("share-edit", edited)).toEqual(edited);
    expect(await repository.findByShareId("share-edit")).toEqual(edited);

    expect(existsSync(join(storagePath, "manifest.json"))).toBe(true);
    expect(readdirSync(storagePath).some((fileName) => fileName.endsWith(".adpk"))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(storagePath, "manifest.json"), "utf8")) as {
      format: string;
      packIndex: readonly unknown[];
    };
    expect(manifest.format).toBe("arch-draw-compressed-v1");
    expect(manifest.packIndex).toHaveLength(1);

    expect(await repository.deleteById("diagram-a", sessionA)).toBe(true);
    expect(await repository.findById("diagram-a", sessionA)).toBeNull();
    expect(await repository.findShareById("share-edit")).toBeNull();
  });

  it("skips rewriting unchanged packs and keeps the store consistent on update/delete", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "arch-draw-compressed-repository-"));
    const storagePath = join(tempDir, "architectures.store");
    const repository = makeCompressedArchitectureRepository(storagePath);
    const session = "s";
    const make = (id: string, now: string): ArchitectureDocument =>
      createEmptyArchitecture({ id, title: `T-${id}`, now });

    const a = make("a", "2026-05-18T10:00:00.000Z");
    const b = make("b", "2026-05-18T10:00:00.000Z");
    const c = make("c", "2026-05-18T10:00:00.000Z");
    await repository.save(a, session);
    await repository.save(b, session);
    await repository.save(c, session);

    const packPath = join(storagePath, "pack-0001.adpk");
    const beforeNoop = readFileSync(packPath);
    // Re-saving an identical record must not rewrite the (byte-identical) pack.
    await repository.save(c, session);
    expect(readFileSync(packPath).equals(beforeNoop)).toBe(true);

    // A real update must persist and leave every other record intact.
    const updatedC = withUpdatedAt(c, "2026-05-18T11:00:00.000Z");
    await repository.save(updatedC, session);
    expect(await repository.findById("a", session)).toEqual(a);
    expect(await repository.findById("b", session)).toEqual(b);
    expect(await repository.findById("c", session)).toEqual(updatedC);

    // Deleting one record keeps the others readable.
    expect(await repository.deleteById("b", session)).toBe(true);
    expect(await repository.findById("a", session)).toEqual(a);
    expect(await repository.findById("b", session)).toBeNull();
    expect(await repository.findById("c", session)).toEqual(updatedC);
  });
  it("commits writes atomically and leaves no temporary files behind", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "arch-draw-compressed-repository-"));
    const storagePath = join(tempDir, "architectures.store");
    const repository = makeCompressedArchitectureRepository(storagePath);
    const session = "s";

    await repository.save(createEmptyArchitecture({ id: "a", title: "A", now: "2026-05-18T10:00:00.000Z" }), session);
    await repository.save(createEmptyArchitecture({ id: "b", title: "B", now: "2026-05-18T10:01:00.000Z" }), session);
    await repository.deleteById("a", session);

    const leftovers = readdirSync(storagePath).filter((fileName) => fileName.includes(".tmp-"));
    expect(leftovers).toEqual([]);
    expect(await repository.findById("b", session)).not.toBeNull();
  });

  it("refuses to treat a corrupt manifest as an empty store", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "arch-draw-compressed-repository-"));
    const storagePath = join(tempDir, "architectures.store");
    const session = "s";
    const architecture = createEmptyArchitecture({ id: "keep", title: "Keep", now: "2026-05-18T10:00:00.000Z" });

    await makeCompressedArchitectureRepository(storagePath).save(architecture, session);
    const packsBefore = readdirSync(storagePath).filter((fileName) => fileName.endsWith(".adpk"));
    expect(packsBefore.length).toBeGreaterThan(0);

    // Simulate a manifest left corrupt by a crash mid-write.
    writeFileSync(join(storagePath, "manifest.json"), "{ not valid json");

    const repository = makeCompressedArchitectureRepository(storagePath);
    await expect(repository.findAll(session)).rejects.toThrow();
    // The data must still be on disk: corruption must never wipe the packs.
    expect(readdirSync(storagePath).filter((fileName) => fileName.endsWith(".adpk"))).toEqual(packsBefore);
  });

  it("migrates a legacy dictionary store to the portable format on first read", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "arch-draw-compressed-repository-"));
    const storagePath = join(tempDir, "architectures.store");
    const session = "s";
    const architecture = createEmptyArchitecture({
      id: "legacy",
      title: "Legacy dictionary diagram",
      now: "2026-05-18T10:00:00.000Z"
    });

    await makeCompressedArchitectureRepository(storagePath).save(architecture, session);

    // Simulate a store produced by an older build: re-encode the pack with the
    // non-portable custom dictionary and drop the `dictionaryFree` manifest flag.
    const packPath = join(storagePath, "pack-0001.adpk");
    const content = decodeCompressedPack(readFileSync(packPath));
    writeFileSync(packPath, encodeCompressedPack(content, { useDictionary: true }));
    const manifestPath = join(storagePath, "manifest.json");
    const legacyManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      dictionaryFree?: boolean;
      packIndex: Array<Record<string, unknown>>;
    };
    // Older manifests predate both the portable flag and the per-pack content hash.
    delete legacyManifest.dictionaryFree;
    for (const entry of legacyManifest.packIndex) delete entry.contentHash;
    writeFileSync(manifestPath, JSON.stringify(legacyManifest));
    expect(packUsesDictionary(readFileSync(packPath))).toBe(true);

    // Opening the store reads the legacy pack and rewrites it dictionary-free.
    const repository = makeCompressedArchitectureRepository(storagePath);
    expect(await repository.findById("legacy", session)).toEqual(architecture);

    expect(packUsesDictionary(readFileSync(packPath))).toBe(false);
    const migratedManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      dictionaryFree?: boolean;
    };
    expect(migratedManifest.dictionaryFree).toBe(true);
    expect(await repository.findById("legacy", session)).toEqual(architecture);
  });
});

const withUpdatedAt = (
  architecture: ArchitectureDocument,
  updatedAt: string
): ArchitectureDocument => ({
  ...architecture,
  updatedAt
});
