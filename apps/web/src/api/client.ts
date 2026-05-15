import type {
  ArchitectureDocument,
  ArchitectureSharePackage
} from "@arch-draw/domain";

const API_URL =
  import.meta.env.VITE_API_URL ??
  `${window.location.protocol}//${window.location.hostname || "127.0.0.1"}:3333`;

export type ArchitectureSummary = Readonly<{
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  edgeCount: number;
}>;

export const api = {
  listArchitectures: () =>
    request<readonly ArchitectureSummary[]>("/architectures"),
  createArchitecture: (title: string) =>
    request<ArchitectureDocument>("/architectures", {
      method: "POST",
      body: JSON.stringify({ title })
    }),
  readArchitecture: (id: string) =>
    request<ArchitectureDocument>(`/architectures/${id}`),
  saveArchitecture: (architecture: ArchitectureDocument) =>
    request<ArchitectureDocument>(`/architectures/${architecture.id}`, {
      method: "PUT",
      body: JSON.stringify(architecture)
    }),
  deleteArchitecture: (id: string) =>
    request<void>(`/architectures/${id}`, {
      method: "DELETE"
    }),
  exportArchitecture: (id: string) =>
    request<ArchitectureSharePackage>(`/architectures/${id}/export`),
  importArchitecture: (sharePackage: ArchitectureSharePackage) =>
    request<ArchitectureDocument>("/architectures/import", {
      method: "POST",
      body: JSON.stringify(sharePackage)
    })
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers
    }
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json();

  if (!response.ok) {
    const message = Array.isArray(payload.errors)
      ? payload.errors.join("; ")
      : payload.error ?? "Unexpected API error";
    throw new Error(message);
  }

  return payload as T;
};
