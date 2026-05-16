import type {
  ArchitectureDocument,
  ArchitectureSharePackage
} from "@arch-draw/domain";

const API_URL =
  window.location.port === "5173"
    ? `${window.location.protocol}//${window.location.hostname || "127.0.0.1"}:3333`
    : `${window.location.origin}/api`;

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
  const rawPayload = await response.text();
  const payload = parseJsonSafely(rawPayload);

  if (!response.ok) {
    const message = Array.isArray(payload?.errors)
      ? payload.errors.join("; ")
      : typeof payload?.error === "string"
        ? payload.error
        : `Unexpected API error (${response.status})`;
    throw new Error(message);
  }

  return (payload ?? undefined) as T;
};

const parseJsonSafely = (value: string): Record<string, unknown> | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
};
