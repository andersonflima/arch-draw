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

export type ArchitectureShare = Readonly<{
  shareId: string;
  architectureId: string;
  createdAt: string;
  updatedAt: string;
}>;

export type ArchitectureRepository = Readonly<{
  findAll: (sessionToken: string) => Promise<readonly ArchitectureSummary[]>;
  findById: (id: string, sessionToken: string) => Promise<ArchitectureDocument | null>;
  save: (
    architecture: ArchitectureDocument,
    sessionToken: string
  ) => Promise<ArchitectureDocument>;
  deleteById: (id: string, sessionToken: string) => Promise<boolean>;
  findShareByArchitectureId: (
    architectureId: string,
    sessionToken: string
  ) => Promise<ArchitectureShare | null>;
  createShare: (
    shareId: string,
    architectureId: string,
    sessionToken: string,
    now: string
  ) => Promise<ArchitectureShare | null>;
  findByShareId: (shareId: string) => Promise<ArchitectureDocument | null>;
  saveByShareId: (
    shareId: string,
    architecture: ArchitectureDocument
  ) => Promise<ArchitectureDocument | null>;
}>;
