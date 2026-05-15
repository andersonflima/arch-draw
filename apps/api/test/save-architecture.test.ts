import { describe, expect, it } from "vitest";
import { createEmptyArchitecture } from "@arch-draw/domain";
import { makeSaveArchitecture } from "../src/application/use-cases/save-architecture";
import type { ArchitectureRepository } from "../src/application/contracts/architecture-repository";

describe("save architecture use case", () => {
  it("rejects invalid documents before persistence", async () => {
    const repository: ArchitectureRepository = {
      findAll: async () => [],
      findById: async () => null,
      save: async (architecture) => architecture,
      deleteById: async () => false
    };
    const saveArchitecture = makeSaveArchitecture(repository, {
      now: () => "2026-05-15T12:00:00.000Z"
    });
    const invalid = {
      ...createEmptyArchitecture({
        id: "arch-1",
        title: "Invalid",
        now: "2026-05-15T11:00:00.000Z"
      }),
      edges: [{ id: "edge-1", from: "missing-a", to: "missing-b" }]
    };

    await expect(saveArchitecture(invalid)).resolves.toEqual({
      ok: false,
      statusCode: 400,
      errors: [
        "Edge edge-1 references missing source missing-a",
        "Edge edge-1 references missing target missing-b"
      ]
    });
  });
});

