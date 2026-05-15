import type { ArchitectureRepository } from "../contracts/architecture-repository";

export const makeReadArchitecture =
  (repository: ArchitectureRepository) => async (id: string) =>
    repository.findById(id);

