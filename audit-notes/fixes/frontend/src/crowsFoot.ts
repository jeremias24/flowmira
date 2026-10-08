// ── NEW ── Crow's-foot (cardinality) ends for diagram arrows.
// A mark replaces the arrowhead at its end and is drawn in the arrow itself (not as an SVG
// <marker>), so it takes the arrow's colour, the selection highlight, and shows in exports.
// Same drawing as the ERD module's relationship lines (erd/RelationEdge.tsx).

export type EndMark = "one" | "zeroOrOne" | "many" | "oneOrMany" | "zeroOrMany";

export const END_MARKS: { value: EndMark; label: string }[] = [
  { value: "one", label: "One (exactly one)" },
  { value: "zeroOrOne", label: "Zero or one" },
  { value: "many", label: "Many" },
  { value: "oneOrMany", label: "One or many" },
  { value: "zeroOrMany", label: "Zero or many" },
];

export const isEndMark = (v: unknown): v is EndMark =>
  typeof v === "string" && END_MARKS.some((m) => m.value === v);

type Pt = { x: number; y: number };

/** Radius of the "zero" circle (px). */
const R = 4;

/**
 * The mark at an arrow end. `p` = where the arrow touches the shape, `dir` = unit vector
 * from there along the line (away from the shape). Returns the strokes and, for "zero",
 * the circle's centre.
 */
export function endMark(p: Pt, dir: Pt, mark: EndMark): { d: string; circle?: Pt } {
  const n = { x: -dir.y, y: dir.x }; // sideways
  const at = (a: number, b: number) =>
    `${(p.x + a * dir.x + b * n.x).toFixed(2)},${(p.y + a * dir.y + b * n.y).toFixed(2)}`;
  const bar = (a: number) => `M ${at(a, -6)} L ${at(a, 6)}`;
  // Three prongs spreading from 14 px out back onto the shape.
  const foot = `M ${at(14, 0)} L ${at(0, -7)} M ${at(14, 0)} L ${at(0, 0)} M ${at(14, 0)} L ${at(0, 7)}`;
  const centre = (a: number) => ({ x: p.x + a * dir.x, y: p.y + a * dir.y });
  switch (mark) {
    case "one":
      return { d: `${bar(9)} ${bar(14)}` };
    case "zeroOrOne":
      return { d: bar(9), circle: centre(14 + R) };
    case "many":
      return { d: foot };
    case "oneOrMany":
      return { d: `${foot} ${bar(18)}` };
    case "zeroOrMany":
      return { d: foot, circle: centre(18 + R) };
  }
}

/** How far a mark reaches along the line (px), so other things (hops) keep clear. */
export const END_MARK_LENGTH = 18 + 2 * R;
