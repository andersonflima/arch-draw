import {
  type ArchitectureSharePackage,
  parseSharePackage,
  renameArchitecture
} from "@arch-draw/domain";
import type { ArchitectureRepository } from "../contracts/architecture-repository";
import type { Clock } from "../contracts/clock";
import type { IdGenerator } from "../contracts/id-generator";

export const makeImportArchitecture =
  (
    repository: ArchitectureRepository,
    clock: Clock,
    idGenerator: IdGenerator
  ) =>
  async (payload: ArchitectureSharePackage, sessionToken: string) => {
    const parsed = parseSharePackage(payload);
    if (!parsed.ok) return parsed;

    const now = clock.now();
    const architecture = renameArchitecture(
      {
        ...parsed.architecture,
        id: idGenerator.create(),
        createdAt: now,
        updatedAt: now
      },
      parsed.architecture.title,
      now
    );

    return {
      ok: true as const,
      architecture: await repository.save(architecture, sessionToken)
    };
  };
