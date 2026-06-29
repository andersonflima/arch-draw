import {
  type ArchitectureSharePackage,
  normalizeArchitecture,
  parseSharePackage,
  renameArchitecture,
  validateArchitecture
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
    const renamed = renameArchitecture(
      {
        ...parsed.architecture,
        id: idGenerator.create(),
        createdAt: now,
        updatedAt: now
      },
      parsed.architecture.title,
      now
    );

    // Imported packages are untrusted input: normalize and validate them with the
    // same rules as a direct save before persisting, instead of writing straight
    // to storage.
    const normalized = normalizeArchitecture({ ...renamed, updatedAt: now });
    const validation = validateArchitecture(normalized);
    if (!validation.ok) {
      return { ok: false as const, errors: validation.errors };
    }

    return {
      ok: true as const,
      architecture: await repository.save(normalized, sessionToken)
    };
  };
