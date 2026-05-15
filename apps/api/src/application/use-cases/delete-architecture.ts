import type { ArchitectureRepository } from "../contracts/architecture-repository";

export const makeDeleteArchitecture =
  (repository: ArchitectureRepository) =>
  async (id: string): Promise<boolean> =>
    repository.deleteById(id);

