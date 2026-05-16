import {
  type ArchitectureDocument,
  normalizeArchitecture,
  validateArchitecture
} from "@arch-draw/domain";
import type { ArchitectureRepository } from "../contracts/architecture-repository";
import type { Clock } from "../contracts/clock";

export type SaveArchitectureResult =
  | Readonly<{ ok: true; architecture: ArchitectureDocument }>
  | Readonly<{ ok: false; statusCode: 400; errors: readonly string[] }>;

export const makeSaveArchitecture =
  (repository: ArchitectureRepository, clock: Clock) =>
  async (
    architecture: ArchitectureDocument,
    sessionToken: string
  ): Promise<SaveArchitectureResult> => {
    const normalized = normalizeArchitecture({
      ...architecture,
      updatedAt: clock.now()
    });
    const validation = validateArchitecture(normalized);

    if (!validation.ok) {
      return { ok: false, statusCode: 400, errors: validation.errors };
    }

    return { ok: true, architecture: await repository.save(normalized, sessionToken) };
  };
