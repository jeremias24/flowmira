// Shape library. Path shapes are drawn in a 0–100 box that stretches to the node size
// (strokes stay crisp via vector-effect). Box shapes are plain CSS.
import type { ShapeKey } from "./types";

/** Toolbox categories, in display order. */
export const SHAPE_CATEGORIES = ["Basic", "Flowchart", "Process (BPMN)", "Software"] as const;
export type ShapeCategory = (typeof SHAPE_CATEGORIES)[number];

export interface ShapeDef {
  key: ShapeKey;
  label: string;
  /** Toolbox group. Special shapes (icon, avatar, persona) have their own sections. */
  category?: ShapeCategory;
  /**
   * Glyph shapes (BPMN events, gateways): a fixed-proportion symbol with its caption
   * BELOW it, as in BPMN. Their path is drawn without stretching.
   */
  glyph?: boolean;
  /** Starting label when added from the toolbox. */
  defaultLabel?: string;
  w: number;
  h: number;
  /** Outline path in a 0–100 viewBox. Absent = CSS box shape. */
  path?: string;
  /** Extra unfilled lines (folds, rims). */
  detail?: string;
  /** Padding that keeps the label inside the visible shape. */
  inset: string;
  /** Icon outline for the toolbox, 0–100 viewBox. */
  icon: string;
  iconDetail?: string;
  defaultFill?: string;
}

const BOX = "M2,2 H98 V98 H2 Z";

export const SHAPES: Record<ShapeKey, ShapeDef> = {
  card: {
    key: "card", category: "Basic", label: "Card", w: 200, h: 72, inset: "8px 10px 8px 14px",
    icon: BOX, iconDetail: "M8,2 V98",
  },
  process: {
    key: "process", category: "Basic", label: "Process", w: 160, h: 72, inset: "8px 12px", icon: BOX,
  },
  decision: {
    key: "decision", category: "Flowchart", label: "Decision", w: 160, h: 100, inset: "20% 22%",
    path: "M50,0 L100,50 L50,100 L0,50 Z", icon: "M50,2 L98,50 L50,98 L2,50 Z",
  },
  terminator: {
    key: "terminator", category: "Flowchart", label: "Start / End", w: 150, h: 56, inset: "6px 22px",
    icon: "M22,4 H78 C104,4 104,96 78,96 H22 C-4,96 -4,4 22,4 Z",
  },
  data: {
    key: "data", category: "Flowchart", label: "Data", w: 160, h: 72, inset: "8px 20%",
    path: "M18,0 H100 L82,100 H0 Z", icon: "M20,4 H98 L80,96 H2 Z",
  },
  document: {
    key: "document", category: "Flowchart", label: "Document", w: 160, h: 84, inset: "8px 12px 22% 12px",
    path: "M0,0 H100 V84 C80,70 64,98 44,94 C26,90 14,80 0,88 Z",
    icon: "M2,4 H98 V80 C78,66 62,98 42,92 C24,88 14,78 2,86 Z",
  },
  subprocess: {
    key: "subprocess", category: "Flowchart", label: "Subprocess", w: 170, h: 72, inset: "8px 14%",
    path: "M0,0 H100 V100 H0 Z", detail: "M10,0 V100 M90,0 V100",
    icon: BOX, iconDetail: "M14,2 V98 M86,2 V98",
  },
  database: {
    key: "database", category: "Software", defaultLabel: "Database", label: "Database", w: 120, h: 96, inset: "30% 10px 12% 10px",
    path: "M0,14 C0,-4 100,-4 100,14 V86 C100,104 0,104 0,86 Z",
    detail: "M0,14 C0,32 100,32 100,14",
    icon: "M10,16 C10,-2 90,-2 90,16 V84 C90,102 10,102 10,84 Z", iconDetail: "M10,16 C10,34 90,34 90,16",
  },
  note: {
    key: "note", category: "Basic", label: "Note", w: 150, h: 100, inset: "10px 16% 10px 10px",
    path: "M0,0 H82 L100,18 V100 H0 Z", detail: "M82,0 V18 H100", defaultFill: "#FFF6CC",
    icon: "M4,4 H74 L96,26 V96 H4 Z", iconDetail: "M74,4 V26 H96",
  },
  circle: {
    key: "circle", category: "Basic", label: "Connector", w: 76, h: 76, inset: "14%",
    icon: "M50,4 C80,4 96,24 96,50 C96,76 80,96 50,96 C20,96 4,76 4,50 C4,24 20,4 50,4 Z",
  },
  text: {
    key: "text", category: "Basic", label: "Text", w: 150, h: 40, inset: "4px 6px",
    icon: "M20,24 H80 M50,24 V84",
  },
  // ----- Process (BPMN-style) -----
  task: {
    key: "task", category: "Process (BPMN)", label: "Task", w: 160, h: 70, inset: "8px 12px",
    icon: "M14,4 H86 C96,4 98,8 98,18 V82 C98,92 96,96 86,96 H14 C4,96 2,92 2,82 V18 C2,8 4,4 14,4 Z",
    defaultLabel: "Task",
  },
  "event-start": {
    key: "event-start", category: "Process (BPMN)", label: "Start event", w: 76, h: 86, inset: "0", glyph: true,
    path: "M50,4 A46,46 0 1,1 49.99,4 Z", icon: "M50,4 A46,46 0 1,1 49.99,4 Z", defaultLabel: "Start",
  },
  "event-end": {
    key: "event-end", category: "Process (BPMN)", label: "End event", w: 76, h: 86, inset: "0", glyph: true,
    path: "M50,4 A46,46 0 1,1 49.99,4 Z", icon: "M50,4 A46,46 0 1,1 49.99,4 Z", iconDetail: "M50,14 A36,36 0 1,1 49.99,14 Z", defaultLabel: "End",
  },
  "event-timer": {
    key: "event-timer", category: "Process (BPMN)", label: "Timer / wait", w: 76, h: 86, inset: "0", glyph: true,
    path: "M50,4 A46,46 0 1,1 49.99,4 Z", detail: "M50,13 A37,37 0 1,1 49.99,13 Z M50,28 V50 L65,60",
    icon: "M50,4 A46,46 0 1,1 49.99,4 Z", iconDetail: "M50,28 V50 L65,60", defaultLabel: "Wait",
  },
  "event-message": {
    key: "event-message", category: "Process (BPMN)", label: "Message", w: 76, h: 86, inset: "0", glyph: true,
    path: "M50,4 A46,46 0 1,1 49.99,4 Z", detail: "M27,33 H73 V67 H27 Z M27,33 L50,52 L73,33",
    icon: "M50,4 A46,46 0 1,1 49.99,4 Z", iconDetail: "M27,33 H73 V67 H27 Z M27,33 L50,52 L73,33", defaultLabel: "Notify",
  },
  "gateway-excl": {
    key: "gateway-excl", category: "Process (BPMN)", label: "Decision gateway", w: 80, h: 90, inset: "0", glyph: true,
    path: "M50,3 L97,50 L50,97 L3,50 Z", detail: "M38,38 L62,62 M62,38 L38,62",
    icon: "M50,3 L97,50 L50,97 L3,50 Z", iconDetail: "M38,38 L62,62 M62,38 L38,62", defaultLabel: "Approved?",
  },
  "gateway-para": {
    key: "gateway-para", category: "Process (BPMN)", label: "Parallel gateway", w: 80, h: 90, inset: "0", glyph: true,
    path: "M50,3 L97,50 L50,97 L3,50 Z", detail: "M50,32 V68 M32,50 H68",
    icon: "M50,3 L97,50 L50,97 L3,50 Z", iconDetail: "M50,32 V68 M32,50 H68", defaultLabel: "In parallel",
  },
  // ----- Software engineering / architecture -----
  server: {
    key: "server", category: "Software", label: "Server", w: 100, h: 130, inset: "56% 10% 6% 10%", defaultLabel: "Server",
    path: "M12,0 H88 Q94,0 94,6 V94 Q94,100 88,100 H12 Q6,100 6,94 V6 Q6,0 12,0 Z",
    detail: "M18,16 H82 M18,30 H82 M18,44 H82 M72,86 H82",
    icon: "M24,2 H76 Q80,2 80,6 V94 Q80,98 76,98 H24 Q20,98 20,94 V6 Q20,2 24,2 Z", iconDetail: "M28,18 H72 M28,32 H72 M28,46 H72",
  },
  cloud: {
    key: "cloud", category: "Software", label: "Cloud", w: 180, h: 110, inset: "34% 20% 16% 18%", defaultLabel: "Cloud",
    path: "M24,88 C6,88 0,70 8,58 C0,42 16,28 32,34 C36,14 60,8 72,24 C86,16 100,30 96,46 C106,56 100,88 80,88 Z",
    icon: "M24,88 C6,88 0,70 8,58 C0,42 16,28 32,34 C36,14 60,8 72,24 C86,16 100,30 96,46 C106,56 100,88 80,88 Z",
  },
  queue: {
    key: "queue", category: "Software", label: "Queue", w: 180, h: 70, inset: "6px 20% 6px 10%", defaultLabel: "Queue",
    path: "M12,0 H88 C100,0 100,100 88,100 H12 C0,100 0,0 12,0 Z", detail: "M88,0 C76,0 76,100 88,100",
    icon: "M12,14 H88 C100,14 100,86 88,86 H12 C0,86 0,14 12,14 Z", iconDetail: "M88,14 C76,14 76,86 88,86",
  },
  component: {
    key: "component", category: "Software", label: "Component", w: 170, h: 80, inset: "6px 10px 6px 24%", defaultLabel: "Component",
    path: "M14,0 H100 V100 H14 Z M4,20 H24 V36 H4 Z M4,64 H24 V80 H4 Z",
    icon: "M18,6 H98 V94 H18 Z M6,24 H30 V40 H6 Z M6,60 H30 V76 H6 Z",
  },
  service: {
    key: "service", category: "Software", label: "Service / API", w: 160, h: 90, inset: "6px 20%", defaultLabel: "Service",
    path: "M20,0 H80 L100,50 L80,100 H20 L0,50 Z", icon: "M22,6 H78 L98,50 L78,94 H22 L2,50 Z",
  },
  package: {
    key: "package", category: "Software", label: "Package / module", w: 160, h: 110, inset: "24% 8px 8px", defaultLabel: "Package",
    path: "M0,0 H42 L50,16 H100 V100 H0 Z", detail: "M0,16 H50",
    icon: "M2,8 H42 L50,22 H98 V94 H2 Z", iconDetail: "M2,22 H50",
  },
  browser: {
    key: "browser", category: "Software", label: "Web app", w: 190, h: 120, inset: "22% 8px 8px", defaultLabel: "Web app",
    path: "M0,0 H100 V100 H0 Z", detail: "M0,18 H100 M6,9 H8 M12,9 H14 M18,9 H20",
    icon: "M2,6 H98 V94 H2 Z", iconDetail: "M2,26 H98",
  },
  mobile: {
    key: "mobile", category: "Software", label: "Mobile app", w: 90, h: 140, inset: "16% 8px 16%", defaultLabel: "Mobile app",
    path: "M16,0 H84 Q100,0 100,12 V88 Q100,100 84,100 H16 Q0,100 0,88 V12 Q0,0 16,0 Z", detail: "M36,6 H64 M42,94 H58",
    icon: "M32,2 H68 Q76,2 76,10 V90 Q76,98 68,98 H32 Q24,98 24,90 V10 Q24,2 32,2 Z", iconDetail: "M44,90 H56",
  },
  "uml-class": {
    key: "uml-class", category: "Software", label: "Class (UML)", w: 180, h: 130, inset: "3px 8px 76% 8px", defaultLabel: "ClassName",
    path: "M0,0 H100 V100 H0 Z", detail: "M0,24 H100 M0,62 H100",
    icon: "M8,2 H92 V98 H8 Z", iconDetail: "M8,30 H92 M8,64 H92",
  },
  actor: {
    key: "actor", category: "Software", label: "User (actor)", w: 70, h: 104, inset: "0", glyph: true, defaultLabel: "User",
    path: "M50,4 A14,14 0 1,1 49.99,4 Z", detail: "M50,32 V66 M22,44 H78 M50,66 L28,98 M50,66 L72,98",
    icon: "M50,4 A14,14 0 1,1 49.99,4 Z", iconDetail: "M50,32 V66 M22,44 H78 M50,66 L28,98 M50,66 L72,98",
  },
  firewall: {
    key: "firewall", category: "Software", label: "Firewall", w: 90, h: 100, inset: "0", glyph: true, defaultLabel: "Firewall",
    path: "M2,10 H98 V90 H2 Z", detail: "M2,36 H98 M2,63 H98 M50,10 V36 M26,36 V63 M74,36 V63 M50,63 V90",
    icon: "M2,10 H98 V90 H2 Z", iconDetail: "M2,36 H98 M2,63 H98 M50,10 V36 M26,36 V63 M74,36 V63 M50,63 V90",
  },
  "load-balancer": {
    key: "load-balancer", category: "Software", label: "Load balancer", w: 80, h: 104, inset: "0", glyph: true, defaultLabel: "Load balancer",
    path: "M50,4 A46,46 0 1,1 49.99,4 Z", detail: "M24,50 H72 M24,50 L68,28 M24,50 L68,72 M64,44 L72,50 L64,56",
    icon: "M50,4 A46,46 0 1,1 49.99,4 Z", iconDetail: "M24,50 H72 M24,50 L68,28 M24,50 L68,72",
  },
  // Picture from the icon library with a caption (see icons.tsx). Not listed with shapes.
  icon: {
    key: "icon", label: "Icon", w: 96, h: 100, inset: "0",
    icon: "M50,10 C62,10 70,20 70,32 C70,44 62,54 50,54 C38,54 30,44 30,32 C30,20 38,10 50,10 Z M14,94 C14,72 30,62 50,62 C70,62 86,72 86,94",
  },

  // Illustrated person with a caption (see avatars.tsx). Offered in the Personas section.
  avatar: {
    key: "avatar", label: "Persona avatar", w: 100, h: 118, inset: "0",
    icon: "M50,8 C80,8 96,28 96,50 C96,76 78,96 50,96 C22,96 4,76 4,50 C4,28 20,8 50,8 Z",
  },
  // Persona card: avatar, name, role, goals and pain points.
  persona: {
    key: "persona", label: "Persona card", w: 290, h: 230, inset: "0",
    icon: "M4,6 H96 V94 H4 Z", iconDetail: "M12,16 H34 V38 H12 Z M42,20 H86 M42,32 H74 M12,52 H88 M12,66 H80 M12,80 H84",
  },
};

/** Shapes with their own toolbox section instead of the Shapes grid. */
export const SPECIAL_SHAPES: ShapeKey[] = ["icon", "avatar", "persona"];

/** Shapes offered in the Shapes section by default. */
export const ALL_SHAPES = (Object.keys(SHAPES) as ShapeKey[]).filter((k) => !SPECIAL_SHAPES.includes(k));

export function ShapeIcon({ shape }: { shape: ShapeKey }) {
  const def = SHAPES[shape];
  const lineOnly = shape === "text";
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio={def.glyph ? "xMidYMid meet" : "none"}
      className="h-[26px] w-[38px] overflow-visible"
      aria-hidden="true"
    >
      <path
        d={def.icon}
        vectorEffect="non-scaling-stroke"
        strokeWidth={shape === "event-end" ? 3 : 1.5}
        className={lineOnly ? "fill-none stroke-ink" : "fill-paper stroke-ink group-hover:fill-mark"}
      />
      {def.iconDetail && (
        <path d={def.iconDetail} vectorEffect="non-scaling-stroke" strokeWidth={1.5} className="fill-none stroke-ink" />
      )}
    </svg>
  );
}


/**
 * Group shape keys by category. Groups appear in the order of their first shape in `keys`,
 * so each template's palette decides what comes first (e.g. BPMN first in Swimlane).
 */
export function groupByCategory(keys: ShapeKey[]): { category: ShapeCategory; keys: ShapeKey[] }[] {
  const order: ShapeCategory[] = [];
  for (const k of keys) {
    const c = SHAPES[k].category;
    if (c && !order.includes(c)) order.push(c);
  }
  return order.map((category) => ({ category, keys: keys.filter((k) => SHAPES[k].category === category) }));
}
