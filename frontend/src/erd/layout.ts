// Automatic layout for ERD tables (dagre, MIT). Saved positions always win.
import dagre from "@dagrejs/dagre";
import type { ErdLayout, ErdSchema, ErdTable } from "./types";

export const TABLE_WIDTH = 270;
export const HEADER_HEIGHT = 40;
export const ROW_HEIGHT = 28;

export const tableHeight = (t: ErdTable) => HEADER_HEIGHT + Math.max(1, t.columns.length) * ROW_HEIGHT + 8;

/** Positions for every table: saved ones as-is, new ones laid out left → right by relationship. */
export function layoutTables(schema: ErdSchema, saved: ErdLayout, force = false): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 110, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const t of schema.tables) g.setNode(t.id, { width: TABLE_WIDTH, height: tableHeight(t) });
  // "one" side first, so parents sit left of their children.
  for (const r of schema.refs) {
    const [parent, child] = r.from.card === "*" ? [r.to.table, r.from.table] : [r.from.table, r.to.table];
    if (g.hasNode(parent) && g.hasNode(child) && parent !== child) g.setEdge(parent, child);
  }
  dagre.layout(g);
  const out: Record<string, { x: number; y: number }> = {};
  for (const t of schema.tables) {
    const keep = !force ? saved.tables?.[t.id] : undefined;
    if (keep) { out[t.id] = keep; continue; }
    const n = g.node(t.id);
    out[t.id] = { x: Math.round(n.x - TABLE_WIDTH / 2), y: Math.round(n.y - tableHeight(t) / 2) };
  }
  return out;
}
