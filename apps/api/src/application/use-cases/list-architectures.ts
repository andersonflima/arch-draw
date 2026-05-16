import type { ArchitectureRepository } from "../contracts/architecture-repository";

export const makeListArchitectures =
  (repository: ArchitectureRepository) => async (sessionToken: string) =>
    repository.findAll(sessionToken);
