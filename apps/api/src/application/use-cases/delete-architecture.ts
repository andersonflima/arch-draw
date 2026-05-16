import type { ArchitectureRepository } from "../contracts/architecture-repository";

export const makeDeleteArchitecture =
  (repository: ArchitectureRepository) =>
  async (id: string, sessionToken: string): Promise<boolean> =>
    repository.deleteById(id, sessionToken);
