// Copy/paste format for Flowmira shapes and arrows.
// The system clipboard gets two flavours: our own MIME type with the full data (works across
// diagrams and tabs) and plain text with the labels (pasting into Word/Slack gives the text).
import type { SavedEdge, SavedItem } from "./types";

export const CLIP_MIME = "application/x-flowmira+json";

export interface ClipItem extends SavedItem {
  /** Absolute canvas position (x/y in SavedItem are relative to the item's zone). */
  ax: number;
  ay: number;
}

export interface ClipPayload {
  flowmira: 1;
  items: ClipItem[];
  edges: SavedEdge[];
}

/** Fallback when the browser gives no clipboard access (e.g. right-click menu "Paste"). */
let memory: ClipPayload | null = null;

export function remember(payload: ClipPayload) {
  memory = payload;
}
export function recall(): ClipPayload | null {
  return memory;
}

export function encode(payload: ClipPayload): { json: string; text: string } {
  return {
    json: JSON.stringify(payload),
    text: payload.items
      .map((i) => i.label)
      .filter(Boolean)
      .join("\n"),
  };
}

export function decode(raw: string | undefined | null): ClipPayload | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<ClipPayload>;
    if (p.flowmira !== 1 || !Array.isArray(p.items) || !Array.isArray(p.edges))
      return null;
    return p as ClipPayload;
  } catch {
    return null;
  }
}

/** Is the user typing somewhere? Then copy/paste/undo belong to that field, not the canvas. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (
    el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
  );
}
