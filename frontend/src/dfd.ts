// ── NEW ── Data flow diagram (Gane & Sarson) shapes: what each one shows, the fields the
// Details panel offers for it, and the number a new one starts with.
import type { ItemFields, ItemNodeType, ShapeKey } from "./types";
import { isItemNode, type AppNode } from "./types";

export type DfdShape = "dfd-process" | "dfd-entity" | "dfd-store";

export const isDfdShape = (shape: ShapeKey): shape is DfdShape =>
  shape === "dfd-process" || shape === "dfd-entity" || shape === "dfd-store";

/** Field keys saved in `fields`. Kept the same on every DFD shape, so changing shape keeps them. */
export interface DfdField {
  key: "ref" | "subtitle" | "description";
  label: string;
  placeholder: string;
  rows?: number;
}

export const DFD_FIELDS: Record<DfdShape, DfdField[]> = {
  "dfd-process": [
    { key: "ref", label: "Number", placeholder: "e.g. 0, 1, 2.1" },
    { key: "subtitle", label: "Second line", placeholder: "e.g. (NFPEIS)" },
    { key: "description", label: "Description", placeholder: "What this process does", rows: 2 },
  ],
  "dfd-entity": [
    { key: "description", label: "Description", placeholder: "e.g. Dealer, Bank, Customer", rows: 2 },
  ],
  "dfd-store": [
    { key: "ref", label: "Store ID", placeholder: "e.g. D1" },
  ],
};

/** Starting label and number: processes count 1, 2, 3…; stores D1, D2…; entities have none. */
export function dfdStart(shape: DfdShape, nodes: AppNode[]): { label: string; fields: ItemFields } {
  const same = nodes.filter(isItemNode).filter((n: ItemNodeType) => n.data.shape === shape);
  if (shape === "dfd-entity") return { label: "External entity", fields: {} };
  const prefix = shape === "dfd-store" ? "D" : "";
  // Highest top-level number used so far ("2.1" counts as 2); a renamed "0" still counts.
  const used = same.map((n) => {
    const m = /^\s*[A-Za-z]*\s*(\d+)/.exec(n.data.fields.ref ?? "");
    return m ? Number(m[1]) : 0;
  });
  const next = used.length ? Math.max(...used) + 1 : 1;
  return {
    label: shape === "dfd-store" ? "Data store" : "Process",
    fields: { ref: `${prefix}${next}` },
  };
}
