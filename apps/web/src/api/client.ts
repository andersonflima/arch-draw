import type {
  ArchitectureDocument,
  ArchitectureSharePackage
} from "@arch-draw/domain";

export const API_BASE_URL =
  window.location.port === "5173"
    ? `${window.location.protocol}//localhost:8080`
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

export type AuthenticatedUser = Readonly<{
  id: string;
  email: string;
  name: string;
  picture?: string;
}>;

export type AuthSession = Readonly<{
  authEnabled: boolean;
  authenticated: boolean;
  user: AuthenticatedUser | null;
}>;

export type ArchitectureShareLink = Readonly<{
  shareId: string;
  sharePath: string;
}>;

export type ShareAccessMode = "edit" | "read-only";

export type SharedArchitecturePayload = Readonly<{
  architecture: ArchitectureDocument;
  accessMode: ShareAccessMode;
}>;

export type AwsDiscoveryInput = Readonly<{
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  accountLabel?: string;
  regions: readonly string[];
}>;

export type SharedRealtimeEvent =
  | Readonly<{
      type: "presence";
      participants: readonly Readonly<{
        clientId: string;
        displayName: string;
        color: string;
        joinedAt: string;
        lastSeenAt: string;
      }>[];
    }>
  | Readonly<{
      type: "cursor";
      clientId: string;
      displayName: string;
      color: string;
      x: number;
      y: number;
      visible: boolean;
      at: string;
    }>
  | Readonly<{
      type: "document";
      clientId: string;
      updatedAt: string;
    }>
  | Readonly<{
      type: "view";
      clientId: string;
      zoom: number;
      panX: number;
      panY: number;
      maximizedNodeId: string | null;
      at: string;
    }>;

export const api = {
  getAuthSession: async () => {
    const response = await request<{
      ok: boolean;
      authEnabled: boolean;
      authenticated: boolean;
      user: AuthenticatedUser | null;
    }>("/auth/session");
    return {
      authEnabled: response.authEnabled,
      authenticated: response.authenticated,
      user: response.user
    } satisfies AuthSession;
  },
  buildGoogleLoginUrl: (returnTo = window.location.href) =>
    `${API_BASE_URL}/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`,
  logout: () =>
    request<void>("/auth/logout", {
      method: "POST"
    }),
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
    }),
  discoverAwsArchitecture: (input: AwsDiscoveryInput) =>
    request<ArchitectureDocument>("/cloud/aws/discover", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  createArchitectureShare: (
    id: string,
    accessMode: ShareAccessMode
  ) =>
    request<ArchitectureShareLink>(`/architectures/${id}/share`, {
      method: "POST",
      body: JSON.stringify({ accessMode })
    }),
  readSharedArchitecture: (shareId: string) =>
    request<SharedArchitecturePayload>(`/architectures/shared/${encodeURIComponent(shareId)}`),
  saveSharedArchitecture: (
    shareId: string,
    architecture: ArchitectureDocument,
    options: Readonly<{ clientId?: string }> = {}
  ) =>
    request<ArchitectureDocument>(
      `/architectures/shared/${encodeURIComponent(shareId)}${options.clientId ? `?clientId=${encodeURIComponent(options.clientId)}` : ""}`,
      {
        method: "PUT",
        body: JSON.stringify(architecture)
      }
    ),
  publishSharedCursor: (
    shareId: string,
    payload: Readonly<{
      clientId: string;
      displayName: string;
      color: string;
      x: number;
      y: number;
      visible: boolean;
    }>
  ) =>
    request<void>(`/architectures/shared/${encodeURIComponent(shareId)}/cursor`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  publishSharedView: (
    shareId: string,
    payload: Readonly<{
      clientId: string;
      zoom: number;
      panX: number;
      panY: number;
      maximizedNodeId: string | null;
    }>
  ) =>
    request<void>(`/architectures/shared/${encodeURIComponent(shareId)}/view`, {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const hasBody = typeof init.body === "string" && init.body.length > 0;
  const csrfHeader = resolveCsrfHeader(init.method);
  const defaultHeaders: Record<string, string> = hasBody
    ? { "content-type": "application/json" }
    : {};
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...defaultHeaders,
      ...csrfHeader,
      ...init.headers
    }
  });

  if (response.status === 204) return undefined as T;
  const rawPayload = await response.text();
  const payload = parseJsonSafely(rawPayload);

  if (!response.ok) {
    const message = Array.isArray(payload?.errors)
      ? payload.errors.join("; ")
      : typeof payload?.message === "string"
        ? payload.message
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

const resolveCsrfHeader = (method: string | undefined): Record<string, string> => {
  const normalizedMethod = (method ?? "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod)) return {};
  const token = readCookieValue("archdraw_csrf");
  return token ? { "x-csrf-token": token } : {};
};

const readCookieValue = (name: string): string | null => {
  if (typeof document === "undefined") return null;
  const encodedPrefix = `${encodeURIComponent(name)}=`;
  const cookie = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(encodedPrefix));
  if (!cookie) return null;
  const rawValue = cookie.slice(encodedPrefix.length);
  if (!rawValue) return null;
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
};
