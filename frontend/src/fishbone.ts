// ── NEW ── whole file
// Fishbone (Ishikawa) diagrams: places every cause along its bone and keeps the head (the
// problem) at the end of the spine. Bones are the template's zones; causes are items in them.
import {
  boneColumns, boneStart, isTopBone, layoutOf, makeItemNode, sizeOf, type XY,
} from "./templateEngine";
import { isItemNode, type AppNode, type ItemNodeType, type TemplateDefinition, type TemplateLayout } from "./types";

/** The head is an ordinary shape with this id: editable text, font and colors, but it can't be moved or deleted. */
export const FISH_HEAD_ID = "fishbone-head";
const HEAD = { w: 220, h: 110, label: "Problem (effect)" };
/** Space between the causes and the spine. */
const SPINE_CLEAR = 16;
/** Space between a cause's right edge and its bone. */
const BONE_GAP = 8;

export interface FishboneArrangement {
  nodes: AppNode[];
  /** Shared bone height the causes need (never below the template's own). */
  length: number;
  /** Did any cause or the head move (or was the head added)? */
  changed: boolean;
}

/**
 * Lay out a fishbone diagram. Causes keep their order on a bone (top to bottom, as the user
 * dropped them) and sit just left of it, so they follow the slant. All bones share one height:
 * enough for the bone with the most causes.
 */
export function arrangeFishbone(t: TemplateDefinition, base: TemplateLayout, nodes: AppNode[]): FishboneArrangement {
  const l = layoutOf(t);
  const start = boneStart(l);
  const W = l.zoneWidth;

  const byZone = new Map<string, ItemNodeType[]>();
  for (const n of nodes) {
    if (!isItemNode(n) || !n.parentId) continue;
    byZone.set(n.parentId, [...(byZone.get(n.parentId) ?? []), n]);
  }

  let need = 0;
  for (const z of t.zones) {
    const stack = (byZone.get(z.id) ?? []).reduce((sum, n) => sum + sizeOf(n).h + l.itemGap, 0);
    need = Math.max(need, l.headerTop + l.itemGap + stack + SPINE_CLEAR);
  }
  const H = Math.round(Math.max(base.zoneHeight ?? 240, need));
  const slope = (W - start) / Math.max(1, H - l.headerTop);

  const place = new Map<string, XY>();
  t.zones.forEach((z, i) => {
    const top = isTopBone(i);
    const causes = [...(byZone.get(z.id) ?? [])].sort(
      (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
    );
    // Top bones: label at the top, bone runs down to the spine. Bottom bones: mirrored.
    let y = top ? l.headerTop + l.itemGap : SPINE_CLEAR;
    for (const n of causes) {
      const { w, h } = sizeOf(n);
      const mid = y + h / 2;
      const boneX = top ? start + (mid - l.headerTop) * slope : W - mid * slope;
      place.set(n.id, { x: Math.max(4, Math.round(boneX - w - BONE_GAP)), y: Math.round(y) });
      y += h + l.itemGap;
    }
  });

  // The head sits where the spine ends, centred on it.
  const headX = boneColumns(t) * (W + l.gap);
  let changed = false;
  let head = nodes.find((n): n is ItemNodeType => isItemNode(n) && n.id === FISH_HEAD_ID);
  if (!head) {
    changed = true;
    head = makeItemNode(t, {
      id: FISH_HEAD_ID, x: headX, y: H - HEAD.h / 2, w: HEAD.w, h: HEAD.h,
      shape: "process", label: HEAD.label, fill: t.accent,
    });
  }
  place.set(FISH_HEAD_ID, { x: headX, y: Math.round(H - sizeOf(head).h / 2) });

  const moved = (n: AppNode): AppNode => {
    const p = place.get(n.id);
    const isHead = n.id === FISH_HEAD_ID;
    if (!p && !isHead) return n;
    const samePlace = !p || (p.x === n.position.x && p.y === n.position.y);
    if (!samePlace) changed = true;
    if (samePlace && (!isHead || (n.draggable === false && n.deletable === false))) return n;
    return {
      ...n,
      ...(p ? { position: p } : {}),
      ...(isHead ? { draggable: false, deletable: false } : {}),
    };
  };
  const out = nodes.map(moved);
  if (!nodes.some((n) => n.id === FISH_HEAD_ID)) out.push(moved(head));
  return { nodes: out, length: H, changed };
}
