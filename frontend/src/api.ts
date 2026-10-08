import type {
  DiagramCreate, DiagramOut, DiagramSummary, DiagramUpdate, TemplateOut, TemplateSummary,
} from "./types";

// Empty string = same origin (Docker/nginx proxies /api to the backend).
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    const detail = typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`;
    throw new ApiError(detail, res.status);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export const api = {
  listTemplates: () => request<TemplateSummary[]>("/api/templates"),
  getTemplate: (key: string) => request<TemplateOut>(`/api/templates/${encodeURIComponent(key)}`),
  listDiagrams: () => request<DiagramSummary[]>("/api/diagrams"),
  getDiagram: (id: number) => request<DiagramOut>(`/api/diagrams/${id}`),
  createDiagram: (payload: DiagramCreate) =>
    request<DiagramOut>("/api/diagrams", { method: "POST", body: JSON.stringify(payload) }),
  updateDiagram: (id: number, payload: DiagramUpdate) =>
    request<DiagramOut>(`/api/diagrams/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteDiagram: (id: number) => request<null>(`/api/diagrams/${id}`, { method: "DELETE" }),
};

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
