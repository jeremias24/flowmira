// Turns a template definition into React Flow nodes and converts between
// React Flow nodes and the saved format. Nothing here is SIPOC-specific.
import { ALL_SHAPES, SHAPES, SPECIAL_SHAPES } from "./shapes";
import { normalizeAvatar } from "./avatars";
import { DEFAULT_ICON, isIconKey } from "./icons";
import type {
  AppNode, AvatarSpec, IconKey, ItemFields, ItemNodeType, SavedItem, ShapeKey,
  TemplateDefinition, TemplateLayout, TemplateZone, ZoneNodeType, LayoutOverrides,
} from "./types";
import { isItemNode } from "./types";

const PAD = 12;

/** Height of the caption under glyph shapes (BPMN events/gateways); matches --cap in styles.css. */
export const GLYPH_CAPTION = 24;

/**
 * Distance from a shape's top to its visual centre. For glyph shapes that's the middle of
 * the symbol, not of the whole box (symbol + caption), so events line up with tasks.
 */
export function visualCenterY(shape: ShapeKey | undefined, h: number): number {
  return shape && SHAPES[shape].glyph ? (h - GLYPH_CAPTION) / 2 : h / 2;
}

export interface XY { x: number; y: number }
export interface Size { w: number; h: number }

export interface ResolvedLayout {
  type: "columns" | "rows" | "free";
  zoneWidth: number;
  zoneHeight: number;
  gap: number;
  itemHeight: number;
  itemGap: number;
  /** Space reserved at the top of a zone (column header). 0 for rows. */
  headerTop: number;
  /** Space reserved at the left of a zone (lane label band). 0 for columns. */
  headerLeft: number;
  /** Default card width inside a zone. */
  itemWidth: number;
}

export function layoutOf(template: TemplateDefinition): ResolvedLayout {
  const l = template.layout;
  if (l.type === "rows") {
    // Swimlanes: long horizontal lanes, label band on the left, items flow left → right.
    return {
      type: "rows",
      zoneWidth: l.zoneWidth ?? 1800,
      zoneHeight: l.zoneHeight ?? 170,
      gap: l.gap ?? 0,
      itemHeight: l.itemHeight ?? 64,
      itemGap: l.itemGap ?? 40,
      headerTop: 0,
      headerLeft: l.headerWidth ?? 140,
      itemWidth: 170,
    };
  }
  const zoneWidth = l.zoneWidth ?? 230;
  return {
    type: l.type,
    zoneWidth,
    zoneHeight: l.zoneHeight ?? 620,
    gap: l.gap ?? 14,
    itemHeight: l.itemHeight ?? 72,
    itemGap: l.itemGap ?? 26,
    headerTop: l.headerHeight ?? 58,
    headerLeft: 0,
    itemWidth: zoneWidth - PAD * 2,
  };
}

export const hasZones = (t: TemplateDefinition) => t.zones.length > 0;
export const mustSnap = (t: TemplateDefinition) => hasZones(t) && t.rules?.itemsSnapToZone !== false;
export const paletteOf = (t: TemplateDefinition): ShapeKey[] =>
  (t.palette ?? ALL_SHAPES).filter((k) => !SPECIAL_SHAPES.includes(k));

/** Does this template's toolbox offer the Personas section? (default: yes) */
export const offersPersonas = (t: TemplateDefinition) => t.personas !== false;
export const defaultShapeOf = (t: TemplateDefinition): ShapeKey =>
  t.shapes.item.defaultShape ?? paletteOf(t)[0] ?? "process";

/** Size of one zone, including the user's overrides (per-zone width/height, shared length). */
export function zoneSize(template: TemplateDefinition, zoneId: string | undefined): Size {
  const l = layoutOf(template);
  const own = zoneId ? template.layout.sizes?.[zoneId] : undefined;
  return l.type === "rows"
    ? { w: l.zoneWidth, h: own ?? l.zoneHeight }
    : { w: own ?? l.zoneWidth, h: l.zoneHeight };
}

/** Top-left of the zone at `index`: zones sit side by side (columns) or stacked (rows). */
export function zonePosition(template: TemplateDefinition, index: number): XY {
  const l = layoutOf(template);
  let offset = 0;
  for (const z of template.zones.slice(0, index)) {
    const size = zoneSize(template, z.id);
    offset += (l.type === "rows" ? size.h : size.w) + l.gap;
  }
  return l.type === "rows" ? { x: 0, y: offset } : { x: offset, y: 0 };
}

export function zoneOrigin(template: TemplateDefinition, zoneId: string | undefined): XY {
  const i = template.zones.findIndex((z) => z.id === zoneId);
  return i < 0 ? { x: 0, y: 0 } : zonePosition(template, i);
}

export function buildZoneNodes(
  template: TemplateDefinition,
  onAdd: (zoneId: string) => void,
  onResize: ZoneNodeType["data"]["onResize"],
): ZoneNodeType[] {
  const l = layoutOf(template);
  return template.zones.map((zone, i) => {
    const { w, h } = zoneSize(template, zone.id);
    return {
      id: zone.id,
      type: "zone",
      position: zonePosition(template, i),
      width: w,
      height: h,
      draggable: false,
      selectable: false,
      deletable: false,
      connectable: false,
      zIndex: 0,
      data: {
        ...zone, onAdd, onResize, width: w, height: h,
        orientation: l.type === "rows" ? "row" : "column", headerLeft: l.headerLeft,
      },
    };
  });
}

export function zoneById(template: TemplateDefinition, id: string | null | undefined): TemplateZone | undefined {
  return id ? template.zones.find((z) => z.id === id) : undefined;
}

/** Can an item in this zone (or free, if undefined) have arrows at all? */
export function isConnectableIn(template: TemplateDefinition, zoneId: string | undefined): boolean {
  const only = template.rules?.edgesOnlyWithin;
  return only ? zoneId !== undefined && only.includes(zoneId) : true;
}

/** Can an arrow join an item in zone a to an item in zone b? */
export function canConnect(template: TemplateDefinition, a: string | undefined, b: string | undefined): boolean {
  const only = template.rules?.edgesOnlyWithin;
  if (!only) return true;
  return a !== undefined && a === b && only.includes(a);
}

/** Default size for a shape, narrowed to fit the zone it's placed in. */
export function defaultSize(template: TemplateDefinition, shape: ShapeKey, inZone: boolean, zoneId?: string): Size {
  const def = SHAPES[shape];
  if (!inZone) return { w: def.w, h: def.h };
  const l = layoutOf(template);
  const zone = zoneSize(template, zoneId);
  if (l.type === "rows") {
    // Lanes limit height, not width.
    if (shape === "card") return { w: l.itemWidth, h: l.itemHeight };
    const maxH = zone.h - 16;
    return def.h > maxH ? { w: Math.round(def.w * (maxH / def.h)), h: maxH } : { w: def.w, h: def.h };
  }
  const itemWidth = zone.w - PAD * 2;
  if (shape === "card") return { w: itemWidth, h: l.itemHeight };
  return { w: Math.min(def.w, itemWidth), h: def.h };
}

export function sizeOf(n: AppNode): Size {
  return {
    w: n.width ?? n.measured?.width ?? 160,
    h: n.height ?? n.measured?.height ?? 72,
  };
}

export interface ItemInput {
  id: string;
  zone?: string | null;
  x: number;
  y: number;
  w?: number;
  h?: number;
  shape?: ShapeKey;
  icon?: IconKey;
  avatar?: AvatarSpec;
  fill?: string;
  opacity?: number;
  color?: string;
  label: string;
  fields?: ItemFields;
}

export function makeItemNode(template: TemplateDefinition, input: ItemInput): ItemNodeType {
  const zone = input.zone ?? undefined;
  const shape = input.shape && SHAPES[input.shape] ? input.shape : defaultShapeOf(template);
  const size = defaultSize(template, shape, zone !== undefined, zone);
  return {
    id: input.id,
    type: "item",
    ...(zone ? { parentId: zone } : {}),
    position: { x: input.x, y: input.y },
    width: input.w ?? size.w,
    height: input.h ?? size.h,
    zIndex: 1,
    data: {
      label: input.label,
      fields: input.fields ?? {},
      shape,
      ...(shape === "icon" ? { icon: isIconKey(input.icon) ? input.icon : DEFAULT_ICON } : {}),
      ...(shape === "avatar" || shape === "persona" ? { avatar: normalizeAvatar(input.avatar) } : {}),
      fill: input.fill,
      ...(input.opacity !== undefined && input.opacity < 1 ? { opacity: Math.max(0.1, input.opacity) } : {}),
      ...(input.color ? { color: input.color } : {}),
      zoneColor: zoneById(template, zone)?.color,
      cardFields: template.shapes.item.fields
        .filter((f) => f.showOnCard)
        .map((f) => ({ key: f.key, prefix: f.cardLabel })),
      connectable: isConnectableIn(template, zone),
    },
  };
}

export function itemsToNodes(template: TemplateDefinition, items: SavedItem[]): ItemNodeType[] {
  const known = new Set(template.zones.map((z) => z.id));
  return items
    .filter((it) => !it.zone || known.has(it.zone))
    .map((it) => makeItemNode(template, it));
}

export function nodesToItems(nodes: AppNode[]): SavedItem[] {
  return nodes.filter(isItemNode).map((n) => {
    const { w, h } = sizeOf(n);
    return {
      id: n.id,
      zone: n.parentId ?? null,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      w: Math.round(w),
      h: Math.round(h),
      shape: n.data.shape,
      ...(n.data.icon ? { icon: n.data.icon } : {}),
      ...(n.data.avatar ? { avatar: n.data.avatar } : {}),
      ...(n.data.fill ? { fill: n.data.fill } : {}),
      ...(n.data.opacity !== undefined && n.data.opacity < 1 ? { opacity: n.data.opacity } : {}),
      ...(n.data.color ? { color: n.data.color } : {}),
      label: n.data.label,
      fields: n.data.fields,
    };
  });
}

/** Next free slot in a zone: below the last item (columns) or right of it (rows). */
export function nextSlot(template: TemplateDefinition, nodes: AppNode[], zoneId: string, size?: Size, shape?: ShapeKey): XY {
  const l = layoutOf(template);
  const children = nodes.filter((n) => n.parentId === zoneId);
  if (l.type === "rows") {
    const h = size?.h ?? l.itemHeight;
    const right = children.reduce((max, n) => Math.max(max, n.position.x + sizeOf(n).w), l.headerLeft);
    const x = children.length ? right + l.itemGap : l.headerLeft + l.itemGap / 2;
    // Visual centre on the lane's centre line, so tasks, events and gateways line up.
    return { x, y: Math.max(6, Math.round(zoneSize(template, zoneId).h / 2 - visualCenterY(shape, h))) };
  }
  const bottom = children.reduce((max, n) => Math.max(max, n.position.y + sizeOf(n).h), l.headerTop);
  const y = children.length ? bottom + l.itemGap : l.headerTop + l.itemGap / 2;
  return { x: PAD, y };
}

/** Which zone contains an absolute canvas point? */
export function zoneAt(template: TemplateDefinition, point: XY): { zone: TemplateZone; origin: XY } | null {
  for (const [i, zone] of template.zones.entries()) {
    const p = zonePosition(template, i);
    const { w, h } = zoneSize(template, zone.id);
    if (point.x >= p.x && point.x <= p.x + w && point.y >= p.y && point.y <= p.y + h) {
      return { zone, origin: p };
    }
  }
  return null;
}

/**
 * Keep an item inside its zone ACROSS the zone (within a column's width / a lane's height)
 * and clear of the header. Along the zone it may go past the end: the zone grows instead
 * (see growToFit).
 */
export function clampInZone(template: TemplateDefinition, pos: XY, size: Size, zoneId?: string): XY {
  const l = layoutOf(template);
  const zone = zoneSize(template, zoneId);
  const minX = l.headerLeft + 6;
  const minY = l.headerTop || 6;
  return l.type === "rows"
    ? { x: Math.max(pos.x, minX), y: Math.min(Math.max(pos.y, minY), Math.max(minY, zone.h - size.h - 6)) }
    : { x: Math.min(Math.max(pos.x, minX), Math.max(minX, zone.w - size.w - 6)), y: Math.max(pos.y, minY) };
}

// ---------------------------------------------------------------------------------------
// Resizable zones
// ---------------------------------------------------------------------------------------

/** Smallest sizes a zone may have, whatever its content. */
const MIN_COLUMN_WIDTH = 140;
const MIN_COLUMN_HEIGHT = 200;
const MIN_LANE_HEIGHT = 80;
const MIN_LANE_LENGTH = 400;
/** Space kept between the last shape and the zone's edge. */
const EDGE_PAD = 16;

/** Template layout with a diagram's size overrides applied. */
export function withLayout(template: TemplateDefinition, base: TemplateLayout, o: LayoutOverrides): TemplateDefinition {
  const rows = base.type === "rows";
  return {
    ...template,
    layout: {
      ...base,
      ...(o.length ? (rows ? { zoneWidth: o.length } : { zoneHeight: o.length }) : {}),
      ...(o.sizes && Object.keys(o.sizes).length ? { sizes: o.sizes } : { sizes: undefined }),
    },
  };
}

/** Right and bottom edge of the shapes in each zone (zone-relative), by zone id. */
function contentExtents(nodes: AppNode[]): Record<string, { right: number; bottom: number }> {
  const out: Record<string, { right: number; bottom: number }> = {};
  for (const n of nodes) {
    if (!isItemNode(n) || !n.parentId) continue;
    const { w, h } = sizeOf(n);
    const e = out[n.parentId] ?? { right: 0, bottom: 0 };
    out[n.parentId] = { right: Math.max(e.right, n.position.x + w), bottom: Math.max(e.bottom, n.position.y + h) };
  }
  return out;
}

/** Smallest allowed value for an edge, so no shape ends up outside its zone. */
export function minZoneValue(
  template: TemplateDefinition, nodes: AppNode[], zoneId: string, edge: "right" | "bottom",
): number {
  const l = layoutOf(template);
  const ext = contentExtents(nodes);
  const all = Object.values(ext);
  if (l.type === "rows") {
    if (edge === "right") return Math.max(MIN_LANE_LENGTH, ...all.map((e) => e.right + EDGE_PAD));
    return Math.max(MIN_LANE_HEIGHT, (ext[zoneId]?.bottom ?? 0) + 6);
  }
  if (edge === "bottom") return Math.max(MIN_COLUMN_HEIGHT, ...all.map((e) => e.bottom + EDGE_PAD));
  return Math.max(MIN_COLUMN_WIDTH, (ext[zoneId]?.right ?? 0) + 6);
}

/** Current overrides read back from an effective template. */
export function currentOverrides(template: TemplateDefinition, base: TemplateLayout): LayoutOverrides {
  const rows = base.type === "rows";
  const length = rows ? template.layout.zoneWidth : template.layout.zoneHeight;
  const baseLength = rows ? base.zoneWidth : base.zoneHeight;
  return {
    ...(length !== undefined && length !== baseLength ? { length } : {}),
    ...(template.layout.sizes ? { sizes: { ...template.layout.sizes } } : {}),
  };
}

/**
 * Overrides that make every zone big enough for its shapes.
 * mode "grow": only ever enlarge (used automatically). mode "fit": snug fit, may shrink
 * (the "Fit to content" button), never below the template's default size.
 */
export function fitOverrides(
  template: TemplateDefinition, base: TemplateLayout, nodes: AppNode[], mode: "grow" | "fit",
): LayoutOverrides {
  const l = layoutOf(template);
  const baseL = layoutOf({ ...template, layout: base });
  const rows = l.type === "rows";
  const ext = contentExtents(nodes);
  const all = Object.values(ext);
  const needLength = rows
    ? Math.max(0, ...all.map((e) => e.right + EDGE_PAD * 2))
    : Math.max(0, ...all.map((e) => e.bottom + EDGE_PAD));
  const curLength = rows ? l.zoneWidth : l.zoneHeight;
  const baseLength = rows ? baseL.zoneWidth : baseL.zoneHeight;
  const length = mode === "grow" ? Math.max(curLength, needLength) : Math.max(baseLength, needLength);

  const sizes: Record<string, number> = {};
  for (const z of template.zones) {
    const cur = rows ? zoneSize(template, z.id).h : zoneSize(template, z.id).w;
    const baseSize = rows ? baseL.zoneHeight : baseL.zoneWidth;
    const need = rows ? (ext[z.id]?.bottom ?? 0) + 6 : (ext[z.id]?.right ?? 0) + 6;
    const v = mode === "grow" ? Math.max(cur, need) : Math.max(baseSize, need);
    if (v !== baseSize) sizes[z.id] = Math.round(v);
  }
  return {
    ...(Math.round(length) !== baseLength ? { length: Math.round(length) } : {}),
    ...(Object.keys(sizes).length ? { sizes } : {}),
  };
}

export const sameOverrides = (a: LayoutOverrides, b: LayoutOverrides) => JSON.stringify(a) === JSON.stringify(b);
