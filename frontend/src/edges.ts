import type { CSSProperties } from "react";
import { MarkerType } from "@xyflow/react";
import { normalizeHex } from "./colors";
import { DASH, GAP } from "./flowAnimation";
import type { AppEdge, EdgeData, SavedEdge } from "./types";

export const DEFAULT_CONNECTOR: EdgeData = { kind: "elbow", dashed: false, arrow: "end" };

/** Arrowhead in the line's colour. Default arrows use the theme-aware variable. */
const arrowHead = (color: string | undefined) =>
  ({ type: MarkerType.ArrowClosed, width: 18, height: 18, color: color ?? "var(--dg-edge)" }) as const;

/** Apply visual properties (type, markers, dash, colour) derived from edge.data. */
export function styleEdge(edge: AppEdge): AppEdge {
  const d: EdgeData = { ...DEFAULT_CONNECTOR, ...edge.data };
  const color = d.color ? normalizeHex(d.color) ?? undefined : undefined;
  // The colour goes in a CSS variable (not a fixed stroke) so the selection highlight
  // in styles.css can still override it on screen.
  const style = {
    ...(color ? { "--edge": color } : {}),
    // Flowing dashes need their own dash pattern; otherwise "dashed" uses the static one.
    ...(d.animation === "dashes" ? { strokeDasharray: `${DASH} ${GAP}` } : d.dashed ? { strokeDasharray: "6 5" } : {}),
  } as CSSProperties;
  return {
    ...edge,
    data: { ...d, color },
    // All arrows use our FlowEdge (edges/FlowEdge.tsx); it reads kind/animation from data.
    type: "flow",
    markerEnd: d.arrow === "none" ? undefined : arrowHead(color),
    markerStart: d.arrow === "both" ? arrowHead(color) : undefined,
    style,
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 3,
  };
}

export function edgeFromSaved(s: SavedEdge): AppEdge {
  return styleEdge({
    id: s.id,
    source: s.source,
    target: s.target,
    // v1 diagrams had one top/bottom handle pair without ids
    sourceHandle: s.sourceHandle ?? "b",
    targetHandle: s.targetHandle ?? "t",
    label: s.label,
    data: {
      kind: s.kind ?? "elbow", dashed: s.dashed ?? false, arrow: s.arrow ?? "end", color: s.color,
      animation: s.animation ?? "none",
      ...(s.bend ? { bend: s.bend } : {}),
    },
  });
}

export function edgeToSaved(e: AppEdge): SavedEdge {
  const d = { ...DEFAULT_CONNECTOR, ...e.data };
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    ...(typeof e.label === "string" && e.label ? { label: e.label } : {}),
    kind: d.kind,
    dashed: d.dashed,
    arrow: d.arrow,
    ...(d.color ? { color: d.color } : {}),
    ...(d.animation && d.animation !== "none" ? { animation: d.animation } : {}),
    ...(d.bend && (d.bend.x || d.bend.y) ? { bend: { x: Math.round(d.bend.x), y: Math.round(d.bend.y) } } : {}),
  };
}
