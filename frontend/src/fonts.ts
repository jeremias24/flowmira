// ── NEW ── Fonts and text sizes for shapes and arrow labels. Diagrams save the font's key, not
// its CSS, so a saved or imported file can only ever pick from this list.

import { normalizeHex } from "./colors"; // ── NEW ──

// Fonts that come with Windows and macOS, so a diagram looks the same on other people's machines.
const FONT_CSS = {
  arial: "Arial, Helvetica, sans-serif",
  verdana: "Verdana, Geneva, sans-serif",
  tahoma: "Tahoma, Geneva, sans-serif",
  trebuchet: '"Trebuchet MS", Helvetica, sans-serif',
  georgia: "Georgia, serif",
  times: '"Times New Roman", Times, serif',
  courier: '"Courier New", Courier, monospace',
} as const;

export type FontKey = keyof typeof FONT_CSS;

export const FONTS: { value: FontKey; label: string }[] = [
  { value: "arial", label: "Arial" },
  { value: "verdana", label: "Verdana" },
  { value: "tahoma", label: "Tahoma" },
  { value: "trebuchet", label: "Trebuchet MS" },
  { value: "georgia", label: "Georgia" },
  { value: "times", label: "Times New Roman" },
  { value: "courier", label: "Courier New" },
];

export const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];

/** Most shapes start at this size, so the - and + buttons step from here. */
const DEFAULT_SIZE = 14;

// ── NEW ── Each alignment and the flexbox value that puts the label on that side.
const ALIGN_ITEMS = { left: "flex-start", center: "center", right: "flex-end" } as const;

export type TextAlign = keyof typeof ALIGN_ITEMS;

export const TEXT_ALIGNS: { value: TextAlign; label: string }[] = [
  { value: "left", label: "Align left" },
  { value: "center", label: "Align center" },
  { value: "right", label: "Align right" },
];

/** Undefined on any field = the shape's default. */
export type TextStyle = { fontFamily?: FontKey; fontSize?: number; textColor?: string; textAlign?: TextAlign }; // ── FIX ── + textColor, textAlign

export const isFontKey = (v: unknown): v is FontKey => FONTS.some((f) => f.value === v);
export const isFontSize = (v: unknown): v is number => FONT_SIZES.includes(v as number);
export const isTextAlign = (v: unknown): v is TextAlign => TEXT_ALIGNS.some((a) => a.value === v); // ── NEW ──

export const fontCss = (key: FontKey | undefined) => (key ? FONT_CSS[key] : undefined);
export const alignItems = (align: TextAlign) => ALIGN_ITEMS[align]; // ── NEW ──

/** Only the valid parts of a saved style. Anything unknown falls back to the default. */
export const savedTextStyle = (s: { fontFamily?: unknown; fontSize?: unknown; textColor?: unknown; textAlign?: unknown }): TextStyle => {
  const textColor = typeof s.textColor === "string" ? normalizeHex(s.textColor) : null; // ── NEW ──
  return {
    ...(isFontKey(s.fontFamily) ? { fontFamily: s.fontFamily } : {}),
    ...(isFontSize(s.fontSize) ? { fontSize: s.fontSize } : {}),
    ...(textColor ? { textColor } : {}), // ── NEW ──
    ...(isTextAlign(s.textAlign) ? { textAlign: s.textAlign } : {}), // ── NEW ──
  };
};

/** The next size up or down; stays put at either end of the list. */
export function stepFontSize(current: number | undefined, direction: 1 | -1): number {
  const from = current ?? DEFAULT_SIZE;
  const next = direction > 0
    ? FONT_SIZES.find((s) => s > from)
    : [...FONT_SIZES].reverse().find((s) => s < from);
  return next ?? from;
}
