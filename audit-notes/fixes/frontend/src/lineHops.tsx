// ── NEW ── Line hops: where two lines cross without being connected, one of them jumps over
// the other with a small arc (the "not connected" symbol from electrical schematics).
// - Each line publishes its shape (as a polyline) to a store shared by one canvas.
// - Each line then looks for the places where it crosses the others and redraws itself
//   with an arc at the crossings it "owns". Exactly one of the two lines hops:
//   a horizontal-ish segment hops over a vertical-ish one; otherwise the line whose id sorts
//   last hops.
// - Lines are only redrawn when they have a hop; otherwise the original path is used as is.
// - Hops are drawn in the SVG path itself, so PNG/PDF/GIF exports show them too.
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Pt = { x: number; y: number };
type Poly = { pts: Pt[]; minX: number; minY: number; maxX: number; maxY: number };

/** Radius of a hop arc (px). */
export const HOP_RADIUS = 6;
/** Crossings this close to either line's ends are ignored (shared connection points, arrowheads). */
// ── FIX ── was 12; now also clears crow's-foot marks (crowsFoot.ts, up to 26 px long)
const END_GAP = 26;

// ---------- path → polyline ----------

const TOKEN = /[MLQC]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/**
 * Turn an SVG path made of absolute M / L / Q / C commands (what React Flow's
 * getStraightPath / getSmoothStepPath / getBezierPath produce) into a polyline.
 * Returns null for anything else, and that line then never hops.
 */
export function flattenPath(d: string): Poly | null {
  const tokens = d.match(TOKEN);
  if (!tokens) return null;
  const pts: Pt[] = [];
  let i = 0;
  let cmd = "";
  const num = () => {
    const t = tokens[i++];
    const n = t === undefined ? NaN : Number(t);
    return n;
  };
  let cur: Pt = { x: 0, y: 0 };
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/^[MLQC]$/i.test(t)) {
      cmd = t;
      i++;
      continue;
    }
    if (cmd === "M" || cmd === "L") {
      cur = { x: num(), y: num() };
      pts.push(cur);
    } else if (cmd === "Q") {
      const c = { x: num(), y: num() };
      const e = { x: num(), y: num() };
      const steps = 4;
      for (let s = 1; s <= steps; s++) {
        const u = s / steps;
        const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, cc = u * u;
        pts.push({ x: a * cur.x + b * c.x + cc * e.x, y: a * cur.y + b * c.y + cc * e.y });
      }
      cur = e;
    } else if (cmd === "C") {
      const c1 = { x: num(), y: num() };
      const c2 = { x: num(), y: num() };
      const e = { x: num(), y: num() };
      const steps = Math.min(48, Math.max(12, Math.round(Math.hypot(e.x - cur.x, e.y - cur.y) / 12)));
      for (let s = 1; s <= steps; s++) {
        const u = s / steps, v = 1 - u;
        const a = v * v * v, b = 3 * v * v * u, cc = 3 * v * u * u, dd = u * u * u;
        pts.push({
          x: a * cur.x + b * c1.x + cc * c2.x + dd * e.x,
          y: a * cur.y + b * c1.y + cc * c2.y + dd * e.y,
        });
      }
      cur = e;
    } else {
      return null; // relative or unsupported command
    }
  }
  if (pts.length < 2 || pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { pts, minX, minY, maxX, maxY };
}

// ---------- crossings ----------

/**
 * Where segments a1→a2 and b1→b2 cross, as fractions along each. Each segment includes its
 * start but not its end, so a crossing exactly on a corner point is found exactly once.
 */
function crossAt(a1: Pt, a2: Pt, b1: Pt, b2: Pt): { t: number; u: number } | null {
  const rx = a2.x - a1.x, ry = a2.y - a1.y;
  const sx = b2.x - b1.x, sy = b2.y - b1.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9 * (Math.hypot(rx, ry) * Math.hypot(sx, sy) + 1e-9)) return null; // parallel
  const qx = b1.x - a1.x, qy = b1.y - a1.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  return t >= 0 && t < 1 && u >= 0 && u < 1 ? { t, u } : null;
}

const cumulative = (pts: Pt[]) => {
  const out = [0];
  for (let k = 1; k < pts.length; k++) {
    out.push(out[k - 1]! + Math.hypot(pts[k]!.x - pts[k - 1]!.x, pts[k]!.y - pts[k - 1]!.y));
  }
  return out;
};

/** Distances along `mine` where it should hop over one of `others`. */
export function hopDistances(id: string, mine: Poly, others: [string, Poly][]): number[] {
  const P = mine.pts;
  const dist = cumulative(P);
  const len = dist[dist.length - 1]!;
  const hops: number[] = [];
  for (const [oid, other] of others) {
    if (oid === id) continue;
    if (other.maxX < mine.minX || other.minX > mine.maxX || other.maxY < mine.minY || other.minY > mine.maxY) continue;
    const Q = other.pts;
    const odist = cumulative(Q);
    const olen = odist[odist.length - 1]!;
    for (let i = 1; i < P.length; i++) {
      const a1 = P[i - 1]!, a2 = P[i]!;
      const aH = Math.abs(a2.x - a1.x) >= Math.abs(a2.y - a1.y);
      for (let j = 1; j < Q.length; j++) {
        const b1 = Q[j - 1]!, b2 = Q[j]!;
        if (Math.max(b1.x, b2.x) < Math.min(a1.x, a2.x) || Math.min(b1.x, b2.x) > Math.max(a1.x, a2.x)) continue;
        if (Math.max(b1.y, b2.y) < Math.min(a1.y, a2.y) || Math.min(b1.y, b2.y) > Math.max(a1.y, a2.y)) continue;
        const hit = crossAt(a1, a2, b1, b2);
        if (!hit) continue;
        const d = dist[i - 1]! + hit.t * (dist[i]! - dist[i - 1]!);
        const od = odist[j - 1]! + hit.u * (odist[j]! - odist[j - 1]!);
        if (d < END_GAP || d > len - END_GAP || od < END_GAP || od > olen - END_GAP) continue;
        const bH = Math.abs(b2.x - b1.x) >= Math.abs(b2.y - b1.y);
        const iHop = aH !== bH ? aH : id > oid;
        if (iHop) hops.push(d);
      }
    }
  }
  return hops.sort((p, q) => p - q);
}

/** Point at distance `d` along the polyline. */
function pointAt(pts: Pt[], dist: number[], d: number): Pt {
  for (let k = 1; k < pts.length; k++) {
    if (dist[k]! >= d) {
      const seg = dist[k]! - dist[k - 1]!;
      const f = seg > 0 ? (d - dist[k - 1]!) / seg : 0;
      const a = pts[k - 1]!, b = pts[k]!;
      return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
    }
  }
  return pts[pts.length - 1]!;
}

const f2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The polyline as an SVG path with an arc over each hop. Hops closer together than one
 * arc are merged into one wider arc. Arcs bulge up (or left, on vertical lines).
 */
export function hoppedPath(mine: Poly, hops: number[], r = HOP_RADIUS): string {
  const P = mine.pts;
  const dist = cumulative(P);
  const len = dist[dist.length - 1]!;
  // Merge into [start, end] intervals.
  const spans: [number, number][] = [];
  for (const h of hops) {
    const s = Math.max(END_GAP / 2, h - r), e = Math.min(len - END_GAP / 2, h + r);
    const last = spans[spans.length - 1];
    if (last && s <= last[1] + 2) last[1] = e;
    else spans.push([s, e]);
  }
  let out = `M ${f2(P[0]!.x)},${f2(P[0]!.y)}`;
  let k = 1;
  for (const [s, e] of spans) {
    while (k < P.length && dist[k]! < s) {
      out += ` L ${f2(P[k]!.x)},${f2(P[k]!.y)}`;
      k++;
    }
    const a = pointAt(P, dist, s), b = pointAt(P, dist, e);
    const dx = b.x - a.x, dy = b.y - a.y;
    const half = Math.max(1, Math.hypot(dx, dy) / 2);
    // sweep-flag 1 bulges towards (dy, -dx); pick the side that points up, or left if vertical.
    const nx = dy, ny = -dx;
    const sweep = ny < -1e-6 || (Math.abs(ny) <= 1e-6 && nx < 0) ? 1 : 0;
    out += ` L ${f2(a.x)},${f2(a.y)} A ${f2(half)} ${f2(half)} 0 0 ${sweep} ${f2(b.x)},${f2(b.y)}`;
    while (k < P.length && dist[k]! <= e) k++;
  }
  for (; k < P.length; k++) out += ` L ${f2(P[k]!.x)},${f2(P[k]!.y)}`;
  return out;
}

// ---------- store shared by the lines of one canvas ----------

class HopStore {
  private lines = new Map<string, Poly>();
  private listeners = new Set<() => void>();
  private version = 0;
  private queued = false;

  set(id: string, poly: Poly | null) {
    if (poly) this.lines.set(id, poly);
    else if (!this.lines.delete(id)) return;
    this.changed();
  }
  remove(id: string) {
    if (this.lines.delete(id)) this.changed();
  }
  entries(): [string, Poly][] {
    return [...this.lines];
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getVersion = () => this.version;

  /** Many lines move at once while dragging: tell everyone once per batch. */
  private changed() {
    this.version++;
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.listeners.forEach((fn) => fn());
    });
  }
}

type HopsContextValue = { store: HopStore; enabled: boolean };
const HopsContext = createContext<HopsContextValue | null>(null);

/** Wrap one canvas. `enabled` = draw hops (the lines still render normally when false). */
export function LineHopsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const store = useMemo(() => new HopStore(), []);
  const value = useMemo(() => ({ store, enabled }), [store, enabled]);
  return <HopsContext.Provider value={value}>{children}</HopsContext.Provider>;
}

const noSubscribe = () => () => {};
const zero = () => 0;

/** The path to draw for line `id`: `path` itself, or a copy with hop arcs over crossings. */
export function useHoppedPath(id: string, path: string): string {
  const ctx = useContext(HopsContext);
  const on = !!ctx?.enabled;
  const poly = useMemo(() => (on ? flattenPath(path) : null), [on, path]);

  useLayoutEffect(() => {
    if (ctx && on) ctx.store.set(id, poly);
  }, [ctx, on, id, poly]);
  useLayoutEffect(() => {
    if (!ctx || !on) return;
    return () => ctx.store.remove(id);
  }, [ctx, on, id]);

  const version = useSyncExternalStore(
    on && ctx ? ctx.store.subscribe : noSubscribe,
    on && ctx ? ctx.store.getVersion : zero,
  );

  return useMemo(() => {
    if (!on || !ctx || !poly) return path;
    const hops = hopDistances(id, poly, ctx.store.entries());
    return hops.length ? hoppedPath(poly, hops) : path;
    // `version` changes whenever any line on the canvas moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, ctx, poly, path, id, version]);
}
