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
  findAll: () => Promise<readonly ArchitectureSummary[]>;
  findById: (id: string) => Promise<ArchitectureDocument | null>;
  save: (architecture: ArchitectureDocument) => Promise<ArchitectureDocument>;
  deleteById: (id: string) => Promise<boolean>;
}>;

