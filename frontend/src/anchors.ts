// ── NEW ── Connection points on a shape. Each side has its middle dot ("t", "r", "b", "l",
// the ids saved diagrams already use) plus one at 25% and 75% along the side ("t25", "t75"...).
// The extra dots sit on the shape's outline, so on a diamond or a circle they don't float in
// the empty corners of the box.
import type { CSSProperties } from "react";
import { Position } from "@xyflow/react";
import { SHAPES } from "./shapes";
import type { ShapeKey } from "./types";

export type Side = "t" | "r" | "b" | "l";

export interface Anchor {
  id: string;
  side: Side;
  pos: Position;
  /** % along the side (left to right, or top to bottom). Absent = the side's middle dot. */
  along?: number;
  label: string;
}

const anchor = (side: Side, pos: Position, along: number | undefined, label: string): Anchor =>
  ({ id: along ? `${side}${along}` : side, side, pos, along, label });

/** Every connection point, in the order the arrow's Details panel lists them. */
export const ANCHORS: Anchor[] = [
  anchor("t", Position.Top, 25, "Top, left"),
  anchor("t", Position.Top, undefined, "Top"),
  anchor("t", Position.Top, 75, "Top, right"),
  anchor("r", Position.Right, 25, "Right, upper"),
  anchor("r", Position.Right, undefined, "Right"),
  anchor("r", Position.Right, 75, "Right, lower"),
  anchor("b", Position.Bottom, 25, "Bottom, left"),
  anchor("b", Position.Bottom, undefined, "Bottom"),
  anchor("b", Position.Bottom, 75, "Bottom, right"),
  anchor("l", Position.Left, 25, "Left, upper"),
  anchor("l", Position.Left, undefined, "Left"),
  anchor("l", Position.Left, 75, "Left, lower"),
];

/** Height of a glyph shape's caption band: the same sum as --cap in styles.css. */
export const captionHeight = (fontSize?: number) => Math.max(24, (fontSize ?? 0) * 1.6);

// CSS shapes with no path of their own (styles.css draws them).
const CSS_OUTLINE: Partial<Record<ShapeKey, string>> = { circle: "M50,0 A50,50 0 1,1 49.99,0 Z" };

type Point = { x: number; y: number };
const sampled = new Map<string, Point[][]>();

/** Points along each stroke of a path in the 0-100 box, so sides can be found by coordinate. */
function sample(d: string): Point[][] {
  let lines = sampled.get(d);
  if (!lines) {
    lines = d.split(/(?=M)/).map((stroke) => {
      const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
      el.setAttribute("d", stroke);
      const length = el.getTotalLength();
      const steps = Math.ceil(length * 2);
      return Array.from({ length: steps + 1 }, (_, i) => {
        const p = el.getPointAtLength((length * i) / steps);
        return { x: p.x, y: p.y };
      });
    });
    sampled.set(d, lines);
  }
  return lines;
}

/** Where a line coming in from outside the box first meets the drawing, in the 0-100 box. */
function outlinePoint(d: string, side: Side, along: number): Point {
  const vertical = side === "t" || side === "b"; // the line travels up or down
  const fromStart = side === "t" || side === "l";
  const across = (p: Point) => (vertical ? p.x : p.y);
  const inward = (p: Point) => (vertical ? p.y : p.x);
  let depth: number | null = null;
  for (const line of sample(d)) {
    let prev: Point | undefined;
    for (const b of line) {
      const a = prev;
      prev = b;
      if (!a || (across(a) - along) * (across(b) - along) > 0) continue;
      const span = across(b) - across(a);
      const at = span === 0 ? inward(a) : inward(a) + ((along - across(a)) / span) * (inward(b) - inward(a));
      if (depth === null || (fromStart ? at < depth : at > depth)) depth = at;
    }
  }
  const edge = depth ?? (fromStart ? 0 : 100); // nothing drawn at this spot: stay on the box
  return vertical ? { x: along, y: edge } : { x: edge, y: along };
}

/** Distance in from the side for a box with round corners of radius r. */
function cornerInset(along: number, sideLength: number, r: number) {
  const fromCorner = Math.min(along, 100 - along) * sideLength / 100;
  return fromCorner < r ? r - Math.sqrt(r * r - (r - fromCorner) ** 2) : 0;
}

/** Position of an extra dot inside the shape, for a Handle's `style`. */
export function anchorStyle(shape: ShapeKey, a: Anchor, width: number, height: number, caption: number): CSSProperties {
  const def = SHAPES[shape] ?? SHAPES.process;
  const along = a.along ?? 50;
  const vertical = a.side === "t" || a.side === "b";

  // Glyph symbols keep their proportions: a square, centred above the caption.
  const size = Math.min(width, height - caption);
  const box = def.glyph
    ? { x: (width - size) / 2, y: (height - caption - size) / 2, w: size, h: size }
    : { x: 0, y: 0, w: width, h: height };

  let x: number;
  let y: number;
  const d = CSS_OUTLINE[shape] ?? (def.path ? `${def.path} ${def.detail ?? ""}` : undefined);
  if (d) {
    const p = outlinePoint(d, a.side, along);
    x = box.x + (p.x / 100) * box.w;
    y = box.y + (p.y / 100) * box.h;
  } else {
    const inset = shape === "terminator"
      ? cornerInset(along, vertical ? width : height, Math.min(width, height) / 2)
      : 0;
    x = vertical ? (along / 100) * width : a.side === "l" ? inset : width - inset;
    y = vertical ? (a.side === "t" ? inset : height - inset) : (along / 100) * height;
  }
  // Measured from the dot's own side, like the middle dots: a shape's CSS border (4px on the
  // left of a card, 6px on top of a persona) would otherwise push the far-side dots outside it.
  // `auto` and the transforms replace React Flow's per-side rules.
  if (a.side === "r") return { left: "auto", right: width - x, top: y, bottom: "auto", transform: "translate(50%, -50%)" };
  if (a.side === "b") return { left: x, right: "auto", top: "auto", bottom: height - y, transform: "translate(-50%, 50%)" };
  return { left: x, right: "auto", top: y, bottom: "auto", transform: "translate(-50%, -50%)" };
}
