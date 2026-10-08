// flowmira-erd API client. In Docker, nginx serves it on the same origin under /api/erd.
// In development it runs on its own port (VITE_ERD_API_URL, default http://localhost:8001).
import type {
  ConnectionForm,
  ErdDoc,
  ErdDocSummary,
  ErdEngine,
  ErdLayout,
  IntrospectResult,
  SourceInfo,
} from "./types";
import { SIGNED_OUT_EVENT } from "../api"; // ── NEW ──

const fromEnv = import.meta.env.VITE_ERD_API_URL;
const BASE =
  fromEnv ??
  (import.meta.env.VITE_API_URL === "" ? "" : "http://localhost:8001");

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api/erd${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    const detail =
      typeof body.detail === "string"
        ? body.detail
        : Array.isArray(body.detail)
          ? "Please check the connection details."
          : `Request failed (${res.status})`;
    // ── NEW ── nginx checks the session before the ERD service (401 = signed out, 403 = not an owner).
    if (res.status === 401) window.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT, { detail }));
    throw new Error(detail);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

const body = (data: unknown) => JSON.stringify(data);

export const erdApi = {
  engines: () => request<ErdEngine[]>("/engines"),
  introspect: (c: ConnectionForm) =>
    request<IntrospectResult>("/introspect", { method: "POST", body: body(c) }),
  list: () => request<ErdDocSummary[]>("/documents"),
  get: (id: number) => request<ErdDoc>(`/documents/${id}`),
  // ── NEW ── from the address bar's encrypted ref
  getByRef: (ref: string) => request<ErdDoc>(`/documents/by-ref/${encodeURIComponent(ref)}`),
  create: (d: {
    title: string;
    dbml: string;
    layout?: ErdLayout;
    source?: "dbml" | "database";
    source_info?: SourceInfo | null;
    // ── NEW ── Only when importing a .flowmira file (keeps the original dates).
    created_at?: string;
    updated_at?: string;
  }) => request<ErdDoc>("/documents", { method: "POST", body: body(d) }),
  update: (
    id: number,
    d: { title?: string; dbml?: string; layout?: ErdLayout },
  ) => request<ErdDoc>(`/documents/${id}`, { method: "PUT", body: body(d) }),
  refresh: (id: number, c: ConnectionForm) =>
    request<ErdDoc>(`/documents/${id}/refresh`, {
      method: "POST",
      body: body(c),
    }),
  remove: (id: number) =>
    request<null>(`/documents/${id}`, { method: "DELETE" }),
};
