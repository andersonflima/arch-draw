import type { ArchitectureDocument } from "@arch-draw/domain";

export type ArchitectureSummary = Readonly<{
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  edgeCount: number;
}>;

export type ArchitectureRepository = Readonly<{
  findAll: (sessionToken: string) => Promise<readonly ArchitectureSummary[]>;
  findById: (id: string, sessionToken: string) => Promise<ArchitectureDocument | null>;
  save: (
    architecture: ArchitectureDocument,
    sessionToken: string
  ) => Promise<ArchitectureDocument>;
  deleteById: (id: string, sessionToken: string) => Promise<boolean>;
}>;
