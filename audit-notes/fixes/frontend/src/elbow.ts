// ── NEW ── Moving an elbow arrow by its yellow handle. React Flow only honours a custom middle
// point on arrows shaped like a Z, so this takes the route it actually draws and moves the part
// of that route that can move:
// - 3 or more segments (Z, U, S): the middle segment slides sideways.
// - 2 segments (one corner): the corner moves freely, which adds two bends.
// - 1 segment (shapes lined up): the middle of the line steps out to the side.
import { Position, getSmoothStepPath } from "@xyflow/react";

export type Point = { x: number; y: number };
export type BendAxis = "x" | "y" | "xy";

export interface ElbowRoute {
  axis: BendAxis;
  /** Where the yellow handle sits. */
  handle: Point;
  /** The moved line, or undefined while it's still on its default route. */
  path?: string;
}

/** Ends closer than this (px, sideways) count as aligned for elbow arrows. */
const ALIGN_TOLERANCE = 10;
const CORNER_RADIUS = 5; // same as React Flow's elbow corners

const isVertical = (p: Position) => p === Position.Top || p === Position.Bottom;
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** Facing ends that are nearly lined up: drawn as one straight line. */
export function isAligned(sx: number, sy: number, sp: Position, tx: number, ty: number, tp: Position) {
  if (isVertical(sp) !== isVertical(tp)) return false;
  return isVertical(sp)
    ? (sy < ty) === (sp === Position.Bottom) && sp !== tp && Math.abs(sx - tx) < ALIGN_TOLERANCE
    : (sx < tx) === (sp === Position.Right) && sp !== tp && Math.abs(sy - ty) < ALIGN_TOLERANCE;
}

/** The arrow's default route as its corner points, without repeats or points mid-segment. */
function corners(sx: number, sy: number, sp: Position, tx: number, ty: number, tp: Position): Point[] {
  const [d] = getSmoothStepPath({
    sourceX: sx, sourceY: sy, sourcePosition: sp, targetX: tx, targetY: ty, targetPosition: tp, borderRadius: 0,
  });
  const n = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const points: Point[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) {
    const p = { x: n[i] ?? 0, y: n[i + 1] ?? 0 };
    const last = points[points.length - 1];
    if (!last || !near(last.x, p.x) || !near(last.y, p.y)) points.push(p);
  }
  return points.filter((p, i) => {
    const a = points[i - 1];
    const b = points[i + 1];
    return !a || !b || !((near(a.x, p.x) && near(p.x, b.x)) || (near(a.y, p.y) && near(p.y, b.y)));
  });
}

/** Draw corner points as a line with rounded corners. */
function rounded(points: Point[]): string {
  const pts = points.filter((p, i) => {
    const a = points[i - 1];
    return !a || !near(a.x, p.x) || !near(a.y, p.y);
  });
  let d = "";
  pts.forEach((p, i) => {
    const a = pts[i - 1];
    const b = pts[i + 1];
    if (!a) { d += `M ${p.x},${p.y}`; return; }
    if (!b) { d += ` L ${p.x},${p.y}`; return; }
    const r = Math.min(CORNER_RADIUS, Math.hypot(p.x - a.x, p.y - a.y) / 2, Math.hypot(p.x - b.x, p.y - b.y) / 2);
    const toward = (q: Point) => {
      const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      return { x: p.x + ((q.x - p.x) / l) * r, y: p.y + ((q.y - p.y) / l) * r };
    };
    const [from, to] = [toward(a), toward(b)];
    d += ` L ${from.x},${from.y} Q ${p.x},${p.y} ${to.x},${to.y}`;
  });
  return d;
}

export function elbowRoute(
  sx: number, sy: number, sp: Position, tx: number, ty: number, tp: Position, bend?: Point,
): ElbowRoute {
  const b = bend ?? { x: 0, y: 0 };
  const s = { x: sx, y: sy };
  const t = { x: tx, y: ty };
  const route = isAligned(sx, sy, sp, tx, ty, tp) ? [s, t] : corners(sx, sy, sp, tx, ty, tp);

  if (route.length <= 2) {
    const flat = !isVertical(sp);
    const axis = flat ? "y" : "x";
    const shift = b[axis];
    const mid = { x: (sx + tx) / 2, y: (sy + ty) / 2 };
    if (!shift) return { axis, handle: mid };
    const handle = flat ? { x: mid.x, y: sy + shift } : { x: sx + shift, y: mid.y };
    const [p, q] = [(sx * 3 + tx) / 4, (sx + tx * 3) / 4];
    const [u, v] = [(sy * 3 + ty) / 4, (sy + ty * 3) / 4];
    const step = flat
      ? [{ x: p, y: sy }, { x: p, y: handle.y }, { x: q, y: handle.y }, { x: q, y: ty }]
      : [{ x: sx, y: u }, { x: handle.x, y: u }, { x: handle.x, y: v }, { x: tx, y: v }];
    return { axis, handle, path: rounded([s, ...step, t]) };
  }

  if (route.length === 3) {
    const corner = route[1] ?? s;
    const handle = { x: corner.x + b.x, y: corner.y + b.y };
    if (!b.x && !b.y) return { axis: "xy", handle };
    const flat = near(s.y, corner.y);
    const first = flat ? { x: handle.x, y: sy } : { x: sx, y: handle.y };
    const last = flat ? { x: tx, y: handle.y } : { x: handle.x, y: ty };
    return { axis: "xy", handle, path: rounded([s, first, handle, last, t]) };
  }

  const i = Math.floor((route.length - 2) / 2);
  const [from, to] = [route[i] ?? s, route[i + 1] ?? t];
  const axis = near(from.y, to.y) ? "y" : "x";
  const moved = route.map((p, j) => (j === i || j === i + 1 ? { ...p, [axis]: p[axis] + b[axis] } : p));
  const handle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  handle[axis] += b[axis];
  return { axis, handle, path: b[axis] ? rounded(moved) : undefined };
}
