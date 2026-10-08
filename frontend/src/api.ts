import type {
  DiagramCreate, DiagramOut, DiagramSummary, DiagramUpdate, Me, TemplateOut, TemplateSummary,
} from "./types";

// Empty string = same origin (Docker/nginx proxies /api to the backend).
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** ── NEW ── Fired when any API call says "not signed in", so the app can show the sign-in screen. */
export const SIGNED_OUT_EVENT = "flowmira:signed-out";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include", // ── NEW ── session cookie (also across ports in development)
    ...options,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    const detail = typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`;
    // ── NEW ── The login call answers for itself; everything else means the session ended.
    if (res.status === 401 && path !== "/api/auth/login") {
      window.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT, { detail }));
    }
    throw new ApiError(detail, res.status);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export const api = {
  // ── NEW ── sign-in
  me: () => request<Me>("/api/auth/me"),
  login: (credentials: string) =>
    request<Me>("/api/auth/login", { method: "POST", body: JSON.stringify({ credentials }) }),
  logout: () => request<null>("/api/auth/logout", { method: "POST" }),

  listTemplates: () => request<TemplateSummary[]>("/api/templates"),
  getTemplate: (key: string) => request<TemplateOut>(`/api/templates/${encodeURIComponent(key)}`),
  listDiagrams: () => request<DiagramSummary[]>("/api/diagrams"),
  getDiagram: (id: number) => request<DiagramOut>(`/api/diagrams/${id}`),
  // ── NEW ── from the address bar's encrypted ref
  getDiagramByRef: (ref: string) =>
    request<DiagramOut>(`/api/diagrams/by-ref/${encodeURIComponent(ref)}`),
  createDiagram: (payload: DiagramCreate) =>
    request<DiagramOut>("/api/diagrams", { method: "POST", body: JSON.stringify(payload) }),
  updateDiagram: (id: number, payload: DiagramUpdate) =>
    request<DiagramOut>(`/api/diagrams/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteDiagram: (id: number) => request<null>(`/api/diagrams/${id}`, { method: "DELETE" }),
};

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
