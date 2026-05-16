import { createEmptyArchitecture } from "@arch-draw/domain";
import type { ArchitectureRepository } from "../contracts/architecture-repository";
import type { Clock } from "../contracts/clock";
import type { IdGenerator } from "../contracts/id-generator";

export type CreateArchitectureUseCase = (input: {
  sessionToken: string;
  title: string;
  description?: string;
}) => Promise<ReturnType<typeof createEmptyArchitecture>>;

export const makeCreateArchitecture =
  (
    repository: ArchitectureRepository,
    clock: Clock,
    idGenerator: IdGenerator
  ): CreateArchitectureUseCase =>
  async (input) => {
    const architecture = createEmptyArchitecture({
      id: idGenerator.create(),
      title: input.title,
      description: input.description,
      now: clock.now()
    });

    return repository.save(architecture, input.sessionToken);
  };
