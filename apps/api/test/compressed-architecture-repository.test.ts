import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createEmptyArchitecture, type ArchitectureDocument } from "@arch-draw/domain";
import { makeCompressedArchitectureRepository } from "../src/infra/compressed/compressed-architecture-repository";

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
});

const withUpdatedAt = (
  architecture: ArchitectureDocument,
  updatedAt: string
): ArchitectureDocument => ({
  ...architecture,
  updatedAt
});
