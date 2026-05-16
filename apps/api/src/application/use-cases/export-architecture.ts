import { createSharePackage } from "@arch-draw/domain";
import type { ArchitectureRepository } from "../contracts/architecture-repository";
import type { Clock } from "../contracts/clock";

export const makeExportArchitecture =
  (repository: ArchitectureRepository, clock: Clock) =>
  async (id: string, sessionToken: string) => {
    const architecture = await repository.findById(id, sessionToken);
    return architecture ? createSharePackage(architecture, clock.now()) : null;
  };
