// Fill colours for shapes, plus helpers for custom colours and readable text.

export interface ColorOption { value: string; name: string }

export const NO_FILL = "transparent";

/** Soft fills: light backgrounds that keep dark text. */
export const SOFT_FILLS: ColorOption[] = [
  { value: "#FFFFFF", name: "White" },
  { value: "#ECEFF1", name: "Grey" },
  { value: "#E1EBF4", name: "Blue" },
  { value: "#DDF0EE", name: "Teal" },
  { value: "#E4EFE8", name: "Green" },
  { value: "#FFF6CC", name: "Yellow" },
  { value: "#F6EDD6", name: "Ochre" },
  { value: "#FBE3CF", name: "Orange" },
  { value: "#F7DEDA", name: "Red" },
  { value: "#F1E4EC", name: "Plum" },
  { value: "#E6E4F4", name: "Lavender" },
];

/** Strong fills: saturated backgrounds, text switches to white automatically. */
export const STRONG_FILLS: ColorOption[] = [
  { value: "#16222E", name: "Ink" },
  { value: "#4A5866", name: "Slate" },
  { value: "#2B5F9E", name: "Strong blue" },
  { value: "#1F7A80", name: "Strong teal" },
  { value: "#2F7D4F", name: "Strong green" },
  { value: "#D4A72C", name: "Strong yellow" },
  { value: "#C0782B", name: "Strong orange" },
  { value: "#B23A2F", name: "Strong red" },
  { value: "#7A4E6B", name: "Strong plum" },
  { value: "#3B3F8F", name: "Indigo" },
];

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#abc" / "aabbcc" / "#AABBCC" → "#AABBCC", or null if not a colour. */
export function normalizeHex(input: string): string | null {
  const m = HEX.exec(input.trim());
  if (!m || !m[1]) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${h.toUpperCase()}`;
}

function luminance(hex: string): number {
  const n = normalizeHex(hex);
  if (!n) return 1;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const DARK_TEXT_LUM = luminance("#16222E");

/** True when white text reads better than the diagram's dark text on this fill. */
export function needsLightText(fill: string | undefined): boolean {
  if (!fill || fill === NO_FILL) return false;
  const l = luminance(fill);
  return contrast(l, 1) > contrast(l, DARK_TEXT_LUM);
}

/** Same colour, compared case-insensitively ("transparent" included). */
export const sameColor = (a: string | undefined, b: string | undefined) =>
  (a ?? "").toUpperCase() === (b ?? "").toUpperCase();

/** Arrow colours: strong only, so lines stay visible on light columns and in exports. */
export const ARROW_COLORS: ColorOption[] = [
  { value: "#16222E", name: "Ink" },
  { value: "#4A5866", name: "Slate" },
  { value: "#2B5F9E", name: "Blue" },
  { value: "#1F7A80", name: "Teal" },
  { value: "#2F7D4F", name: "Green" },
  { value: "#D4A72C", name: "Yellow" },
  { value: "#C0782B", name: "Orange" },
  { value: "#B23A2F", name: "Red" },
  { value: "#7A4E6B", name: "Plum" },
  { value: "#3B3F8F", name: "Indigo" },
];
