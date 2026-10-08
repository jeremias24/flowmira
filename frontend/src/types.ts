// Types mirror the FastAPI schemas (backend/app/schemas.py) and template JSON.
import type { Edge, Node } from "@xyflow/react";
import type { IconKey } from "./icons";
import type { AvatarSpec } from "./avatars";
import type { AnimationSpeed, ArrowAnimation } from "./flowAnimation";

export type { IconKey, AvatarSpec };

// ---------- Shapes & connectors ----------
export type ShapeKey =
  | "card" | "process" | "decision" | "terminator" | "data" | "document"
  | "subprocess" | "database" | "note" | "circle" | "text" | "icon" | "avatar" | "persona"
  // Process modelling (BPMN-style), used by the Swimlane template
  | "task" | "event-start" | "event-end" | "event-timer" | "event-message" | "gateway-excl" | "gateway-para"
  // Software engineering / architecture
  | "server" | "cloud" | "queue" | "component" | "browser" | "mobile" | "actor" | "uml-class"
  | "service" | "package" | "firewall" | "load-balancer";

export type EdgeKind = "straight" | "elbow" | "curved";
export type ArrowMode = "end" | "both" | "none";

// `type` aliases (not interfaces) wherever data goes into React Flow nodes/edges,
// because React Flow requires data to satisfy Record<string, unknown>.
export type EdgeData = {
  kind: EdgeKind;
  dashed: boolean;
  arrow: ArrowMode;
  /** Hex colour; undefined = default (theme-aware grey). */
  color?: string;
  /** Moving dashes or dots along the arrow (shown live, exported to GIF). */
  animation?: ArrowAnimation;
  /** Elbow arrows: how far the bend was dragged from its default middle position (px). */
  bend?: { x: number; y: number };
};

// ---------- Template definition ----------
export type FieldType = "text" | "textarea";

export interface TemplateField {
  key: string;
  label: string;
  type: FieldType;
  /** Show this field's value under the title on card shapes. */
  showOnCard?: boolean;
  /** Short prefix on the card, e.g. "CTQ" → "CTQ: …". */
  cardLabel?: string;
}

export type TemplateZone = {
  id: string;
  label: string;
  hint?: string;
  color: string;
};

export interface TemplateLayout {
  type: "columns" | "rows" | "free";
  /** rows only: width of the lane label band on the left. */
  headerWidth?: number;
  /** Per-zone size overrides by zone id: column width (columns) or lane height (rows). */
  sizes?: Record<string, number>;
  zoneWidth?: number;
  zoneHeight?: number;
  gap?: number;
  itemHeight?: number;
  itemGap?: number;
  headerHeight?: number;
}

export interface TemplateDefinition {
  key: string;
  name: string;
  version: number;
  description?: string;
  /** Brand colour for this diagram type (home tile, editor badge). */
  accent?: string;
  layout: TemplateLayout;
  zones: TemplateZone[];
  /** Shapes shown in the left toolbox. Defaults to all shapes. */
  palette?: ShapeKey[];
  /** Show the Personas section in the toolbox (default true). */
  personas?: boolean;
  /** Let users rename/add/remove/reorder zones per diagram (e.g. swimlane lanes). */
  editableZones?: boolean;
  /** What a zone is called in the UI, e.g. "lane" (default "column"). */
  zoneNoun?: string;
  shapes: {
    item: { defaultLabel: string; defaultShape?: ShapeKey; fields: TemplateField[] };
  };
  rules?: {
    /** Items must live inside a zone (column). */
    itemsSnapToZone?: boolean;
    /** Arrows only allowed between items in the same zone, and only these zones. */
    edgesOnlyWithin?: string[];
  };
}

// ---------- API payloads ----------
export interface TemplateSummary {
  key: string;
  name: string;
  version: number;
  accent?: string | null;
}

export interface TemplateOut extends TemplateSummary {
  definition: TemplateDefinition;
}

export type ItemFields = Record<string, string>;

export interface SavedItem {
  id: string;
  /** Zone id, or null/undefined for free-floating shapes. */
  zone?: string | null;
  x: number;
  y: number;
  w?: number;
  h?: number;
  shape?: ShapeKey;
  /** Only for shape "icon". */
  icon?: IconKey;
  /** Only for shapes "avatar" and "persona". */
  avatar?: AvatarSpec;
  fill?: string;
  /** 0.1–1; whole shape including its text. Default 1. */
  opacity?: number;
  /** Icon colour (icons only). Default: the column colour or ink. */
  color?: string;
  label: string;
  fields: ItemFields;
}

export interface SavedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
  kind?: EdgeKind;
  dashed?: boolean;
  arrow?: ArrowMode;
  color?: string;
  animation?: ArrowAnimation;
  bend?: { x: number; y: number };
}

export interface DiagramData {
  items: SavedItem[];
  edges: SavedEdge[];
  /** Per-diagram zones (swimlane lanes) when the template allows editing them. */
  zones?: TemplateZone[] | null;
  /** Per-diagram zone sizes (columns/lanes resized by the user). */
  layout?: LayoutOverrides | null;
  /** Diagram-wide settings. */
  settings?: DiagramSettings | null;
}

export interface DiagramSettings {
  /** Speed of all animated arrows in the diagram (and the GIF loop length). */
  animationSpeed?: AnimationSpeed;
}

/**
 * Size changes a user made to a diagram's columns or lanes.
 * length = column height (columns) or lane length (rows), shared by all zones.
 * sizes  = per-zone column width (columns) or lane height (rows).
 */
export interface LayoutOverrides {
  length?: number;
  sizes?: Record<string, number>;
}

export interface DiagramSummary {
  id: number;
  title: string;
  template_key: string;
  updated_at: string;
}

export interface DiagramOut extends DiagramSummary {
  data: DiagramData;
  created_at: string;
}

export interface DiagramCreate {
  title: string;
  template_key: string;
  data?: DiagramData;
}

export interface DiagramUpdate {
  title?: string;
  data?: DiagramData;
}

// ---------- React Flow nodes & edges ----------
export type ZoneNodeData = TemplateZone & {
  onAdd: (zoneId: string) => void;
  /** Drag an edge: "right" or "bottom", new size in canvas px. */
  onResize: (zoneId: string, edge: "right" | "bottom", value: number) => void;
  orientation: "column" | "row";
  headerLeft: number;
  width: number;
  height: number;
};

export type ItemNodeData = {
  label: string;
  fields: ItemFields;
  shape: ShapeKey;
  icon?: IconKey;
  avatar?: AvatarSpec;
  fill?: string;
  /** 0.1–1, whole shape including text. */
  opacity?: number;
  /** Icon colour (icons only). */
  color?: string;
  /** Fields shown under the title on card shapes (from the template). */
  cardFields?: { key: string; prefix?: string }[];
  /** Outline color, taken from the zone the item sits in. */
  zoneColor?: string;
  connectable: boolean;
};

export type ZoneNodeType = Node<ZoneNodeData, "zone">;
export type ItemNodeType = Node<ItemNodeData, "item">;
export type AppNode = ZoneNodeType | ItemNodeType;
export type AppEdge = Edge<EdgeData>;

export const isItemNode = (n: AppNode): n is ItemNodeType => n.type === "item";

/** Changes to an arrow from the right panel. Handles (sides): "t" | "r" | "b" | "l". */
export type EdgePatch = Partial<EdgeData> & { label?: string; sourceHandle?: string; targetHandle?: string };
