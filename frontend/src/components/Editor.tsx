import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  ConnectionMode,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  getViewportForBounds,
  type Connection,
  type EdgeChange,
  type EdgeTypes,
  type IsValidConnection,
  type NodeChange,
  type NodeTypes,
  type OnNodeDrag,
  type NodeMouseHandler,
  type OnConnectEnd,
  ViewportPortal,
} from "@xyflow/react";
import { getFontEmbedCSS, toCanvas } from "html-to-image";
import { api, errorMessage } from "../api";
import {
  DEFAULT_CONNECTOR,
  edgeFromSaved,
  edgeToSaved,
  styleEdge,
} from "../edges";
import {
  buildZoneNodes,
  itemsToNodes,
  nodesToItems,
  makeItemNode,
  nextSlot,
  zoneAt,
  zoneOrigin,
  clampInZone,
  canConnect,
  defaultSize,
  visualCenterY,
  withLayout,
  minZoneValue,
  currentOverrides,
  fitOverrides,
  sameOverrides,
  layoutOf,
  defaultShapeOf,
  paletteOf,
  mustSnap,
  sizeOf,
  offersPersonas,
  type ItemInput,
  type XY,
} from "../templateEngine";
import { SHAPES } from "../shapes";
import {
  isItemNode,
  type EdgePatch,
  type TemplateZone,
  type SavedItem,
  type SavedEdge,
  type TemplateLayout,
  type LayoutOverrides,
  type AppEdge,
  type AppNode,
  type EdgeData,
  type ItemNodeData,
  type TemplateDefinition,
} from "../types";
import ZoneNode from "../nodes/ZoneNode";
import ShapeNode from "../nodes/ShapeNode";
import FlowEdge from "../edges/FlowEdge";
import Inspector, { type ArrangeMode } from "./Inspector";
import { Button, cx } from "./ui";
import ExportMenu, { type ExportKind } from "./ExportMenu";
import ThemeSwitcher from "./ThemeSwitcher";
import { useTheme } from "../theme";
import {
  CLIP_MIME,
  decode,
  encode,
  isEditableTarget,
  recall,
  remember,
  type ClipItem,
  type ClipPayload,
} from "../clipboard";
import ContextMenu, { type MenuState } from "./ContextMenu";
import { Redo2, Undo2 } from "lucide-react";
import {
  AnimationSpeedContext,
  DEFAULT_SPEED,
  GIF_FRAME_MS,
  SPEEDS,
  applyPhase,
  gifFrameCount,
  isSpeed,
  nextFrame,
  type AnimationSpeed,
} from "../flowAnimation";
import Palette, { SHAPE_MIME, decodeDrag, type PaletteItem } from "./Palette";
import { ICONS } from "../icons";
import { PERSONA_PRESETS } from "../avatars";

const nodeTypes: NodeTypes = { zone: ZoneNode, item: ShapeNode };
const edgeTypes: EdgeTypes = { flow: FlowEdge };

/** Serialised diagram state for undo/redo. */
function makeSnapshot(
  tpl: TemplateDefinition,
  base: TemplateLayout,
  nodes: AppNode[],
  edges: AppEdge[],
  speed: AnimationSpeed,
): string {
  return JSON.stringify({
    items: nodesToItems(nodes),
    edges: edges.map(edgeToSaved),
    zones: tpl.zones,
    layout: currentOverrides(tpl, base),
    speed,
  });
}

type SaveStatus = "loading" | "saved" | "dirty" | "saving" | "error";

interface EditorProps {
  diagramId: number;
  onBack: () => void;
}

function EditorCanvas({ diagramId, onBack }: EditorProps) {
  const [template, setTemplate] = useState<TemplateDefinition | null>(null);
  const [title, setTitle] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connector, setConnector] = useState<EdgeData>(DEFAULT_CONNECTOR);
  // Only auto-fit when there is something to fit; on an empty canvas React Flow would
  // otherwise re-fit (and jump) the moment the first shape is added.
  const [fitOnOpen, setFitOnOpen] = useState(false);
  // "Draw arrow" tool: click a source shape, then a target shape.
  const [arrowMode, setArrowMode] = useState(false);
  const [arrowSource, setArrowSource] = useState<string | null>(null);
  const loaded = useRef(false);
  const templateRef = useRef<TemplateDefinition | null>(null);
  // The template's own layout, before this diagram's resized columns/lanes are applied.
  const baseLayoutRef = useRef<TemplateLayout | null>(null);
  const resizeRef = useRef<
    ((zoneId: string, edge: "right" | "bottom", value: number) => void) | null
  >(null);
  const growRef = useRef<(() => void) | null>(null);
  // Runs after React has applied the latest node changes.
  const scheduleGrow = useCallback(() => {
    window.setTimeout(() => growRef.current?.(), 0);
  }, []);
  // Stable handler handed to zone nodes; forwards to the latest implementation.
  const onZoneResize = useCallback(
    (zoneId: string, edge: "right" | "bottom", value: number) => {
      resizeRef.current?.(zoneId, edge, value);
    },
    [],
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const freeCount = useRef(0);
  const fontCss = useRef<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  // While true, the live animation stops so an export can set each frame itself.
  const animationPaused = useRef(false);
  const resetHistoryRef = useRef<((snap: string) => void) | null>(null);
  // Speed of all animated arrows in this diagram (saved with it).
  const [speed, setSpeedState] = useState<AnimationSpeed>(DEFAULT_SPEED);
  // Alignment guides while dragging (absolute canvas coordinates).
  const [guides, setGuides] = useState<{ x?: number; y?: number } | null>(null);
  const { theme } = useTheme();
  const {
    getNodesBounds,
    getNodes,
    getEdges,
    getInternalNode,
    screenToFlowPosition,
    deleteElements,
  } = useReactFlow<AppNode, AppEdge>();

  // Every real change goes through markDirty; it also records an undo step (see history below).
  const recordRef = useRef<(() => void) | null>(null);
  const captureRef = useRef<(() => void) | null>(null);
  const pendingRef = useRef<() => boolean>(() => false);
  /**
   * Discrete actions (add, paste, delete, connect…) are their own undo step:
   * beginStep() first saves any still-pending typing/drag as a separate step,
   * endStep() records the result once React has applied it.
   */
  const beginStep = useCallback(() => {
    if (pendingRef.current()) captureRef.current?.();
  }, []);
  const endStep = useCallback(() => {
    window.setTimeout(() => captureRef.current?.(), 0);
  }, []);
  const markDirty = useCallback(() => {
    if (!loaded.current) return;
    setStatus("dirty");
    recordRef.current?.();
  }, []);
  const setSpeed = useCallback(
    (next: AnimationSpeed) => {
      setSpeedState(next);
      markDirty();
    },
    [markDirty],
  );

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((m) => (m === msg ? "" : m)), 2800);
  }, []);

  /** Insert a new item and select it. */
  const insertItem = useCallback(
    (node: AppNode) => {
      beginStep();
      setNodes((nds) => [
        ...nds.map((n) => ({ ...n, selected: false })),
        { ...node, selected: true },
      ]);
      setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
      markDirty();
      endStep();
    },
    [setNodes, setEdges, markDirty, beginStep, endStep],
  );

  /** Starting content for a new item: caption, icon or avatar, persona fields. */
  const startingContent = (
    tpl: TemplateDefinition,
    item: PaletteItem,
  ): Partial<ItemInput> & { label: string } => {
    if (item.shape === "icon" && item.icon)
      return { icon: item.icon, label: ICONS[item.icon].label };
    if ((item.shape === "avatar" || item.shape === "persona") && item.preset) {
      const preset = PERSONA_PRESETS[item.preset];
      return item.shape === "avatar"
        ? { avatar: preset.spec, label: preset.label }
        : {
            avatar: preset.spec,
            label: "Persona name",
            fields: { role: preset.label },
          };
    }
    if (item.shape === "persona") return { label: "Persona name" };
    // BPMN shapes start with a meaningful label ("Start", "Approved?"…).
    return {
      label: SHAPES[item.shape].defaultLabel ?? tpl.shapes.item.defaultLabel,
    };
  };

  /** Add an item to the next free slot of a zone (below in columns, to the right in lanes). */
  const addToZone = useCallback(
    (zoneId: string, item?: PaletteItem) => {
      const tpl = templateRef.current;
      if (!tpl) return;
      const what = item ?? { shape: defaultShapeOf(tpl) };
      const { x, y } = nextSlot(
        tpl,
        getNodes(),
        zoneId,
        defaultSize(tpl, what.shape, true, zoneId),
        what.shape,
      );
      insertItem(
        makeItemNode(tpl, {
          id: crypto.randomUUID(),
          zone: zoneId,
          x,
          y,
          shape: what.shape,
          ...startingContent(tpl, what),
        }),
      );
      scheduleGrow();
    },
    [getNodes, insertItem],
  );

  // Stable callback for the zone "+" buttons.
  const onZoneAdd = useCallback(
    (zoneId: string) => addToZone(zoneId),
    [addToZone],
  );

  /** Apply new column/lane sizes: rebuild the zones; shapes keep their places. */
  const applyLayout = useCallback(
    (overrides: LayoutOverrides) => {
      const current = templateRef.current;
      const base = baseLayoutRef.current;
      if (!current || !base) return;
      const next = withLayout(current, base, overrides);
      templateRef.current = next;
      setTemplate(next);
      setNodes((nds) => [
        ...buildZoneNodes(next, onZoneAdd, onZoneResize),
        ...nds.filter(isItemNode),
      ]);
      markDirty();
    },
    [onZoneAdd, onZoneResize, setNodes, markDirty],
  );

  /** After shapes move, are added or resized: enlarge any zone they no longer fit in. */
  growRef.current = () => {
    const tpl = templateRef.current;
    const base = baseLayoutRef.current;
    if (!tpl || !base || tpl.zones.length === 0) return;
    const next = fitOverrides(tpl, base, getNodes(), "grow");
    if (!sameOverrides(next, currentOverrides(tpl, base))) applyLayout(next);
  };

  /** Dragging a column/lane edge. Never smaller than the shapes inside need. */
  resizeRef.current = (zoneId, edge, value) => {
    const tpl = templateRef.current;
    const base = baseLayoutRef.current;
    if (!tpl || !base) return;
    const v = Math.round(
      Math.max(minZoneValue(tpl, getNodes(), zoneId, edge), value),
    );
    const lengthEdge = layoutOf(tpl).type === "rows" ? "right" : "bottom";
    const cur = currentOverrides(tpl, base);
    applyLayout(
      edge === lengthEdge
        ? { ...cur, length: v }
        : { ...cur, sizes: { ...cur.sizes, [zoneId]: v } },
    );
  };

  /** Size panel: set the shared length, fit everything snugly, or go back to defaults. */
  const setLength = useCallback((value: number) => {
    const tpl = templateRef.current;
    const first = tpl?.zones[0];
    if (!tpl || !first) return;
    resizeRef.current?.(
      first.id,
      layoutOf(tpl).type === "rows" ? "right" : "bottom",
      value,
    );
  }, []);
  const fitToContent = useCallback(() => {
    const tpl = templateRef.current;
    const base = baseLayoutRef.current;
    if (tpl && base) applyLayout(fitOverrides(tpl, base, getNodes(), "fit"));
  }, [getNodes, applyLayout]);
  const resetSizes = useCallback(() => {
    applyLayout({});
    scheduleGrow(); // default size, but never cutting off shapes
  }, [applyLayout, scheduleGrow]);

  /** Replace the diagram's zones (lane editor): rebuild them, keep items in their lanes. */
  const applyZones = useCallback(
    (zones: TemplateZone[]) => {
      const current = templateRef.current;
      if (!current) return;
      beginStep();
      const next = { ...current, zones };
      templateRef.current = next;
      setTemplate(next);
      setNodes((nds) => {
        const items = nds
          .filter(isItemNode)
          .filter((n) => !n.parentId || zones.some((z) => z.id === n.parentId));
        const recoloured = items.map((n) =>
          n.parentId
            ? {
                ...n,
                data: {
                  ...n.data,
                  zoneColor: zones.find((z) => z.id === n.parentId)?.color,
                },
              }
            : n,
        );
        return [
          ...buildZoneNodes(next, onZoneAdd, onZoneResize),
          ...recoloured,
        ];
      });
      markDirty();
      endStep();
    },
    [onZoneAdd, onZoneResize, setNodes, markDirty, beginStep, endStep],
  );

  /** Place a shape centred on a canvas point (drop or click). */
  const placeAt = useCallback(
    (item: PaletteItem, center: XY) => {
      const { shape } = item;
      const tpl = templateRef.current;
      if (!tpl) return;
      const hit = tpl.zones.length ? zoneAt(tpl, center) : null;
      if (!hit && mustSnap(tpl)) {
        flash("Drop shapes inside a column.");
        return;
      }
      const size = defaultSize(tpl, shape, Boolean(hit), hit?.zone.id);
      const topLeft = {
        x: center.x - size.w / 2,
        y: center.y - visualCenterY(shape, size.h),
      };
      const pos = hit
        ? clampInZone(
            tpl,
            { x: topLeft.x - hit.origin.x, y: topLeft.y - hit.origin.y },
            size,
            hit.zone.id,
          )
        : topLeft;
      insertItem(
        makeItemNode(tpl, {
          id: crypto.randomUUID(),
          zone: hit?.zone.id,
          ...pos,
          shape,
          ...startingContent(tpl, item),
        }),
      );
      scheduleGrow();
    },
    [flash, insertItem],
  );

  // ----- load -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const diagram = await api.getDiagram(diagramId);
        const definition = (await api.getTemplate(diagram.template_key))
          .definition;
        if (cancelled) return;
        // Diagrams of templates with editable zones (swimlanes) keep their own lane list.
        const withZones =
          definition.editableZones && diagram.data.zones?.length
            ? { ...definition, zones: diagram.data.zones }
            : definition;
        baseLayoutRef.current = definition.layout;
        // Columns/lanes this diagram's author resized.
        const tpl = withLayout(
          withZones,
          definition.layout,
          diagram.data.layout ?? {},
        );
        templateRef.current = tpl;
        setTemplate(tpl);
        setTitle(diagram.title);
        const initialNodes = [
          ...buildZoneNodes(tpl, onZoneAdd, onZoneResize),
          ...itemsToNodes(tpl, diagram.data.items),
        ];
        const initialEdges = diagram.data.edges.map(edgeFromSaved);
        const savedSpeed = diagram.data.settings?.animationSpeed;
        const initialSpeed = isSpeed(savedSpeed) ? savedSpeed : DEFAULT_SPEED;
        setNodes(initialNodes);
        setEdges(initialEdges);
        setSpeedState(initialSpeed);
        // Undo history starts at the diagram exactly as saved. Built from the loaded data,
        // NOT read back from the canvas, which may not have been filled in yet.
        const opened = makeSnapshot(
          tpl,
          definition.layout,
          initialNodes,
          initialEdges,
          initialSpeed,
        );
        setFitOnOpen(tpl.zones.length > 0 || diagram.data.items.length > 0);
        setStatus("saved");
        setTimeout(() => {
          loaded.current = true;
          resetHistoryRef.current?.(opened);
        }, 0);
      } catch (e) {
        if (cancelled) return;
        setError(errorMessage(e));
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [diagramId, onZoneAdd, onZoneResize, setNodes, setEdges]);

  // ----- change tracking -----
  /**
   * Snap a dragged shape so its centre lines up with another shape's centre
   * (same column or same free canvas), and show a guide line. Only for single-shape drags.
   */
  const alignWhileDragging = useCallback(
    (changes: NodeChange<AppNode>[]): NodeChange<AppNode>[] => {
      const moves = changes.filter(
        (c) => c.type === "position" && c.dragging && c.position,
      );
      if (moves.length !== 1) return changes;
      const move = moves[0];
      if (!move || move.type !== "position" || !move.position) return changes;
      const all = getNodes();
      const me = all.find((n) => n.id === move.id);
      if (!me || !isItemNode(me) || !templateRef.current) return changes;

      const SNAP = 8; // px: how close counts as "nearly aligned"
      const { w, h } = sizeOf(me);
      const pos = { ...move.position };
      const cx = pos.x + w / 2;
      const meOff = visualCenterY(me.data.shape, h);
      const cy = pos.y + meOff;
      let bestX = SNAP + 1;
      let bestY = SNAP + 1;
      let guideX: number | undefined;
      let guideY: number | undefined;

      for (const o of all) {
        if (o.id === me.id || !isItemNode(o) || o.parentId !== me.parentId)
          continue;
        const os = sizeOf(o);
        const ocx = o.position.x + os.w / 2;
        const ocy = o.position.y + visualCenterY(o.data.shape, os.h);
        if (Math.abs(ocx - cx) < bestX) {
          bestX = Math.abs(ocx - cx);
          pos.x = ocx - w / 2;
          guideX = ocx;
        }
        if (Math.abs(ocy - cy) < bestY) {
          bestY = Math.abs(ocy - cy);
          pos.y = ocy - meOff;
          guideY = ocy;
        }
      }

      const origin = me.parentId
        ? zoneOrigin(templateRef.current, me.parentId)
        : { x: 0, y: 0 };
      setGuides(
        guideX === undefined && guideY === undefined
          ? null
          : {
              x: guideX === undefined ? undefined : guideX + origin.x,
              y: guideY === undefined ? undefined : guideY + origin.y,
            },
      );
      return changes.map((c) => (c === move ? { ...move, position: pos } : c));
    },
    [getNodes],
  );

  const handleNodesChange = useCallback(
    (incoming: NodeChange<AppNode>[]) => {
      const changes = alignWhileDragging(incoming);
      const structural = changes.some(
        (c) => c.type === "remove" || c.type === "add",
      );
      if (structural) beginStep();
      onNodesChange(changes);
      if (structural) endStep();
      // A shape finished resizing: make sure its zone is still big enough.
      if (changes.some((c) => c.type === "dimensions" && c.resizing === false))
        scheduleGrow();
      const real = changes.some((c) =>
        c.type === "dimensions"
          ? c.resizing !== undefined
          : c.type !== "select",
      );
      if (real) markDirty();
    },
    [
      onNodesChange,
      markDirty,
      alignWhileDragging,
      scheduleGrow,
      beginStep,
      endStep,
    ],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<AppEdge>[]) => {
      const structural = changes.some(
        (c) => c.type === "remove" || c.type === "add",
      );
      if (structural) beginStep();
      onEdgesChange(changes);
      if (structural) endStep();
      if (changes.some((c) => c.type !== "select")) markDirty();
    },
    [onEdgesChange, markDirty, beginStep, endStep],
  );

  // ----- arrows -----
  /** Why an arrow between these two items isn't allowed (empty string = allowed). */
  const blockedReason = useCallback(
    (sourceId: string, targetId: string): string => {
      const tpl = templateRef.current;
      if (!tpl) return "Diagram not loaded.";
      if (sourceId === targetId) return "Pick a different shape to connect to.";
      const all = getNodes();
      const s = all.find((n) => n.id === sourceId);
      const t = all.find((n) => n.id === targetId);
      if (!s || !t || !isItemNode(s) || !isItemNode(t))
        return "Arrows connect shapes.";
      if (canConnect(tpl, s.parentId, t.parentId)) return "";
      const zones = (tpl.rules?.edgesOnlyWithin ?? [])
        .map((id) => tpl.zones.find((z) => z.id === id)?.label ?? id)
        .join(", ");
      return `In ${tpl.name}, arrows only connect shapes within the same column: ${zones}.`;
    },
    [getNodes],
  );

  /** Pick the sides that face each other, based on the shapes' centres. */
  const facingHandles = useCallback(
    (sourceId: string, targetId: string) => {
      const a = getInternalNode(sourceId);
      const b = getInternalNode(targetId);
      if (!a || !b) return { sourceHandle: "b", targetHandle: "t" };
      const ca = {
        x: a.internals.positionAbsolute.x + (a.measured.width ?? 0) / 2,
        y: a.internals.positionAbsolute.y + (a.measured.height ?? 0) / 2,
      };
      const cb = {
        x: b.internals.positionAbsolute.x + (b.measured.width ?? 0) / 2,
        y: b.internals.positionAbsolute.y + (b.measured.height ?? 0) / 2,
      };
      const dx = cb.x - ca.x;
      const dy = cb.y - ca.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0
          ? { sourceHandle: "r", targetHandle: "l" }
          : { sourceHandle: "l", targetHandle: "r" };
      }
      return dy > 0
        ? { sourceHandle: "b", targetHandle: "t" }
        : { sourceHandle: "t", targetHandle: "b" };
    },
    [getInternalNode],
  );

  const createArrow = useCallback(
    (conn: Connection) => {
      beginStep();
      setEdges((eds) =>
        addEdge(
          styleEdge({ ...conn, id: crypto.randomUUID(), data: connector }),
          eds,
        ),
      );
      markDirty();
      endStep();
    },
    [setEdges, markDirty, connector, beginStep, endStep],
  );

  const onConnect = useCallback(
    (params: Connection) => createArrow(params),
    [createArrow],
  );

  const isValidConnection: IsValidConnection<AppEdge> = useCallback(
    (conn) => blockedReason(conn.source, conn.target) === "",
    [blockedReason],
  );

  // Released the drag on a shape but not on one of its dots: connect to the facing side anyway.
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      if (state.isValid || !state.fromNode) return;
      const point = "changedTouches" in event ? event.changedTouches[0] : event;
      if (!point) return;
      const el = document.elementFromPoint(point.clientX, point.clientY);
      const targetId = el?.closest<HTMLElement>(".react-flow__node-item")
        ?.dataset.id;
      if (!targetId || targetId === state.fromNode.id) return;
      const reason = blockedReason(state.fromNode.id, targetId);
      if (reason) {
        flash(reason);
        return;
      }
      const { targetHandle } = facingHandles(state.fromNode.id, targetId);
      createArrow({
        source: state.fromNode.id,
        sourceHandle:
          state.fromHandle?.id ??
          facingHandles(state.fromNode.id, targetId).sourceHandle,
        target: targetId,
        targetHandle,
      });
    },
    [blockedReason, facingHandles, createArrow, flash],
  );

  // Draw-arrow tool: first click picks the source, second click the target.
  const onNodeClick: NodeMouseHandler<AppNode> = useCallback(
    (_e, node) => {
      if (!arrowMode || !isItemNode(node)) return;
      if (!arrowSource) {
        setArrowSource(node.id);
        return;
      }
      if (node.id === arrowSource) {
        setArrowSource(null);
        return;
      }
      const reason = blockedReason(arrowSource, node.id);
      if (reason) {
        flash(reason);
        return;
      }
      createArrow({
        source: arrowSource,
        target: node.id,
        ...facingHandles(arrowSource, node.id),
      });
      setArrowSource(null);
    },
    [arrowMode, arrowSource, blockedReason, createArrow, facingHandles, flash],
  );

  const toggleArrowMode = useCallback(() => {
    setArrowMode((on) => !on);
    setArrowSource(null);
  }, []);

  useEffect(() => {
    if (!arrowMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setArrowMode(false);
        setArrowSource(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [arrowMode]);

  // Highlight the picked source shape (render-only; not saved).
  const renderedNodes = useMemo(
    () =>
      arrowSource
        ? nodes.map((n) =>
            n.id === arrowSource ? { ...n, className: "is-arrow-source" } : n,
          )
        : nodes,
    [nodes, arrowSource],
  );

  // ----- drag between columns / free canvas -----
  const onNodeDragStop: OnNodeDrag<AppNode> = useCallback(
    (_event, dragged) => {
      setGuides(null);
      if (!template || !isItemNode(dragged)) return;
      const tpl = template;
      const size = sizeOf(dragged);
      const origin = dragged.parentId
        ? zoneOrigin(tpl, dragged.parentId)
        : { x: 0, y: 0 };
      const abs = {
        x: origin.x + dragged.position.x,
        y: origin.y + dragged.position.y,
      };
      const center = { x: abs.x + size.w / 2, y: abs.y + size.h / 2 };
      const hit = tpl.zones.length ? zoneAt(tpl, center) : null;

      let nextZone: string | undefined;
      let nextPos: XY;
      if (hit) {
        nextZone = hit.zone.id;
        nextPos = clampInZone(
          tpl,
          { x: abs.x - hit.origin.x, y: abs.y - hit.origin.y },
          size,
          hit.zone.id,
        );
      } else if (dragged.parentId && mustSnap(tpl)) {
        nextZone = dragged.parentId; // snap back into its column
        nextPos = clampInZone(tpl, dragged.position, size, dragged.parentId);
      } else {
        nextZone = undefined; // free canvas
        nextPos = abs;
      }

      setNodes((nds) =>
        nds.map((n): AppNode => {
          if (n.id !== dragged.id || !isItemNode(n)) return n;
          if (nextZone === n.parentId) return { ...n, position: nextPos };
          const moved = makeItemNode(tpl, {
            id: n.id,
            zone: nextZone,
            ...nextPos,
            w: size.w,
            h: size.h,
            shape: n.data.shape,
            icon: n.data.icon,
            avatar: n.data.avatar,
            fill: n.data.fill,
            label: n.data.label,
            fields: n.data.fields,
          });
          return { ...moved, selected: n.selected };
        }),
      );

      if (nextZone !== dragged.parentId) {
        const parentOf = new Map(getNodes().map((n) => [n.id, n.parentId]));
        parentOf.set(dragged.id, nextZone);
        setEdges((eds) =>
          eds.filter(
            (e) =>
              (e.source !== dragged.id && e.target !== dragged.id) ||
              canConnect(tpl, parentOf.get(e.source), parentOf.get(e.target)),
          ),
        );
      }
      markDirty();
      scheduleGrow();
    },
    [template, setNodes, setEdges, getNodes, markDirty],
  );

  // ----- toolbox: drop & click -----
  const onDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(SHAPE_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      const dropped = decodeDrag(e.dataTransfer.getData(SHAPE_MIME));
      if (!dropped) return;
      e.preventDefault();
      placeAt(dropped, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [placeAt, screenToFlowPosition],
  );

  const onPaletteAdd = useCallback(
    (item: PaletteItem) => {
      const tpl = templateRef.current;
      if (!tpl) return;
      const all = getNodes();
      const rect = canvasRef.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          })
        : { x: 0, y: 0 };

      if (mustSnap(tpl)) {
        // Columns: add to the selected item's column, the column in view, or the first one.
        const selectedZone = all.find(
          (n) => isItemNode(n) && n.selected,
        )?.parentId;
        const zoneId =
          selectedZone ?? zoneAt(tpl, center)?.zone.id ?? tpl.zones[0]?.id;
        if (zoneId) addToZone(zoneId, item);
        return;
      }
      // Free canvas: cascade new shapes so they don't stack exactly on top of each other.
      const step = (freeCount.current++ % 6) * 24;
      placeAt(item, { x: center.x + step, y: center.y + step });
    },
    [getNodes, screenToFlowPosition, addToZone, placeAt],
  );

  // ----- selection & inspector -----
  const selectedNode = useMemo(
    () => nodes.filter(isItemNode).find((n) => n.selected),
    [nodes],
  );
  const selectedEdge = useMemo(() => edges.find((e) => e.selected), [edges]);
  // ----- live arrow animation -----
  const hasAnimated = useMemo(
    () => edges.some((e) => e.data?.animation && e.data.animation !== "none"),
    [edges],
  );
  useEffect(() => {
    const root = canvasRef.current;
    if (!hasAnimated || !root) return;
    // Respect "reduce motion": show the arrows' animation style, but keep it still.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => applyPhase(root, 0.25, speed));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const tick = (t: number) => {
      const loop = SPEEDS[speed].loopMs;
      if (!animationPaused.current) applyPhase(root, (t % loop) / loop, speed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasAnimated, speed]);

  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of nodes)
      if (isItemNode(n) && n.parentId)
        counts[n.parentId] = (counts[n.parentId] ?? 0) + 1;
    return counts;
  }, [nodes]);

  const updateItem = useCallback(
    (id: string, patch: Partial<ItemNodeData>) => {
      setNodes((nds) =>
        nds.map(
          (n): AppNode =>
            n.id === id && isItemNode(n)
              ? { ...n, data: { ...n.data, ...patch } }
              : n,
        ),
      );
      markDirty();
    },
    [setNodes, markDirty],
  );

  const updateEdge = useCallback(
    (id: string, patch: EdgePatch) => {
      const { label, sourceHandle, targetHandle, ...dataPatch } = patch;
      const sidesChanged =
        sourceHandle !== undefined || targetHandle !== undefined;
      setEdges((eds) =>
        eds.map((e) =>
          e.id !== id
            ? e
            : styleEdge({
                ...e,
                ...(label !== undefined ? { label } : {}),
                ...(sourceHandle !== undefined ? { sourceHandle } : {}),
                ...(targetHandle !== undefined ? { targetHandle } : {}),
                // New sides = new route: start again from the default bend.
                data: {
                  ...DEFAULT_CONNECTOR,
                  ...e.data,
                  ...dataPatch,
                  ...(sidesChanged ? { bend: undefined } : {}),
                },
              }),
        ),
      );
      markDirty();
    },
    [setEdges, markDirty],
  );

  const deleteItem = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      markDirty();
    },
    [setNodes, setEdges, markDirty],
  );

  const deleteEdge = useCallback(
    (id: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== id));
      markDirty();
    },
    [setEdges, markDirty],
  );

  // ----- save / export -----
  const save = useCallback(async () => {
    setStatus("saving");
    try {
      await api.updateDiagram(diagramId, {
        title: title.trim() || "Untitled",
        data: {
          items: nodesToItems(getNodes()),
          edges: getEdges().map(edgeToSaved),
          ...(templateRef.current?.editableZones
            ? { zones: templateRef.current.zones }
            : {}),
          settings: { animationSpeed: speed },
          ...(templateRef.current &&
          baseLayoutRef.current &&
          templateRef.current.zones.length
            ? {
                layout: currentOverrides(
                  templateRef.current,
                  baseLayoutRef.current,
                ),
              }
            : {}),
        },
      });
      setStatus("saved");
    } catch (e) {
      setError(errorMessage(e));
      setStatus("error");
    }
  }, [diagramId, title, getNodes, getEdges, speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  /** Capture the diagram onto a canvas (document colours, no editing aids). */
  const renderCanvas = useCallback(
    async (transparent: boolean, pixelRatio: number) => {
      const el = document.querySelector<HTMLElement>(".react-flow__viewport");
      const all = getNodes();
      if (!el || all.length === 0) return null;
      const bounds = getNodesBounds(all);
      const w = Math.ceil(bounds.width + 80);
      const h = Math.ceil(bounds.height + 80);
      const vp = getViewportForBounds(bounds, w, h, 0.5, 2, 0.04);
      // Make sure the fonts are loaded, then embed them so the image matches the screen.
      await document.fonts.ready;
      fontCss.current ??= await getFontEmbedCSS(el);
      // .exporting resets theme-dependent and selection colours for the capture.
      canvasRef.current?.classList.add("exporting");
      try {
        const canvas = await toCanvas(el, {
          fontEmbedCSS: fontCss.current,
          ...(transparent ? {} : { backgroundColor: "#ffffff" }),
          width: w,
          height: h,
          pixelRatio,
          style: {
            width: `${w}px`,
            height: `${h}px`,
            transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
          },
          // Leave out editing aids: resize frame, connection dots, + buttons.
          filter: (node) =>
            !(
              node instanceof HTMLElement &&
              (node.classList.contains("no-export") ||
                node.classList.contains("react-flow__handle") ||
                node.classList.contains("react-flow__resize-control"))
            ),
        });
        return { canvas, w, h };
      } finally {
        canvasRef.current?.classList.remove("exporting");
      }
    },
    [getNodes, getNodesBounds],
  );

  const download = (href: string, name: string) => {
    const a = document.createElement("a");
    a.download = name;
    a.href = href;
    a.click();
  };

  /** Animated GIF: one seamless loop of the arrow animations. */
  const exportGif = useCallback(
    async (base: string) => {
      const root = canvasRef.current;
      const first = getNodes().length ? getNodesBounds(getNodes()) : null;
      if (!root || !first) return;
      const frames = gifFrameCount(speed);
      // GIFs get big quickly: cap the width at 1600 px.
      const pixelRatio = Math.min(1.5, 1600 / (first.width + 80));
      const { GIFEncoder, quantize, applyPalette } = await import("gifenc"); // loaded only for GIF export
      const gif = GIFEncoder();
      let palette: number[][] | null = null;
      for (let f = 0; f < frames; f++) {
        setExportProgress(`GIF ${f + 1}/${frames}`);
        applyPhase(root, f / frames, speed);
        await nextFrame();
        const shot = await renderCanvas(false, pixelRatio);
        if (!shot) return;
        const { width, height } = shot.canvas;
        const rgba = shot.canvas
          .getContext("2d")
          ?.getImageData(0, 0, width, height).data;
        if (!rgba) return;
        // One palette for all frames (taken from the first), so colours don't flicker.
        palette ??= quantize(rgba, 256);
        gif.writeFrame(applyPalette(rgba, palette), width, height, {
          palette,
          delay: GIF_FRAME_MS,
        });
      }
      gif.finish();
      const url = URL.createObjectURL(
        new Blob([gif.bytes()], { type: "image/gif" }),
      );
      download(url, `${base}.gif`);
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    [getNodes, getNodesBounds, renderCanvas, speed],
  );

  const exportDiagram = useCallback(
    async (kind: ExportKind) => {
      if (getNodes().length === 0) {
        flash("Add something to the canvas before exporting.");
        return;
      }
      const base = (title || "diagram").replace(/[^\w-]+/g, "_");
      setExporting(true);
      animationPaused.current = true; // exports set the animation frame themselves
      try {
        if (kind === "gif") {
          await exportGif(base);
        } else if (kind === "pdf") {
          const img = await renderCanvas(false, 3);
          if (!img) return;
          const { jsPDF } = await import("jspdf"); // loaded only when someone exports a PDF
          const pdf = new jsPDF({
            orientation: img.w >= img.h ? "landscape" : "portrait",
            unit: "mm",
            format: "a4",
          });
          const pw = pdf.internal.pageSize.getWidth();
          const ph = pdf.internal.pageSize.getHeight();
          const margin = 10;
          const scale = Math.min(
            (pw - margin * 2) / img.w,
            (ph - margin * 2) / img.h,
          );
          const iw = img.w * scale;
          const ih = img.h * scale;
          pdf.setProperties({ title: title || "Diagram", creator: "Flowmira" });
          pdf.addImage(
            img.canvas.toDataURL("image/png"),
            "PNG",
            (pw - iw) / 2,
            (ph - ih) / 2,
            iw,
            ih,
            undefined,
            "FAST",
          );
          pdf.save(`${base}.pdf`);
        } else {
          const transparent = kind === "png-transparent";
          const img = await renderCanvas(transparent, 2);
          if (!img) return;
          download(
            img.canvas.toDataURL("image/png"),
            `${base}${transparent ? "-transparent" : ""}.png`,
          );
        }
      } catch (e) {
        setError(`Export failed: ${errorMessage(e)}`);
        setStatus("error");
      } finally {
        animationPaused.current = false;
        setExportProgress("");
        setExporting(false);
      }
    },
    [getNodes, renderCanvas, exportGif, title, flash],
  );

  // ===================================================================================
  // Editing: undo/redo, copy/cut/paste/duplicate, select all, right-click menu
  // ===================================================================================

  // ----- undo / redo: snapshots of the diagram, taken shortly after each change -----
  const history = useRef<{ stack: string[]; index: number }>({
    stack: [],
    index: -1,
  });
  const historyTimer = useRef<number | null>(null);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });
  const syncHistoryState = () => {
    const h = history.current;
    setHistoryState({
      canUndo: h.index > 0,
      canRedo: h.index < h.stack.length - 1,
    });
  };

  const snapshot = useCallback((): string | null => {
    const tpl = templateRef.current;
    const base = baseLayoutRef.current;
    if (!tpl || !base) return null;
    return makeSnapshot(tpl, base, getNodes(), getEdges(), speed);
  }, [getNodes, getEdges, speed]);

  const captureNow = useCallback(() => {
    if (historyTimer.current !== null) {
      window.clearTimeout(historyTimer.current);
      historyTimer.current = null;
    }
    const snap = snapshot();
    const h = history.current;
    if (!snap || h.stack[h.index] === snap) return;
    h.stack = [...h.stack.slice(0, h.index + 1), snap].slice(-100); // keep the last 100 steps
    h.index = h.stack.length - 1;
    syncHistoryState();
  }, [snapshot]);

  captureRef.current = captureNow;
  pendingRef.current = () => historyTimer.current !== null;

  // A drag or a typed label produces many changes: record them as ONE step.
  recordRef.current = () => {
    if (historyTimer.current !== null)
      window.clearTimeout(historyTimer.current);
    historyTimer.current = window.setTimeout(captureNow, 400);
  };
  /** Start a fresh history whose first step is exactly the diagram as opened. */
  resetHistoryRef.current = (snap: string) => {
    history.current = { stack: [snap], index: 0 };
    syncHistoryState();
  };

  const restore = useCallback(
    (snap: string) => {
      const tpl = templateRef.current;
      const base = baseLayoutRef.current;
      if (!tpl || !base) return;
      const s = JSON.parse(snap) as {
        items: SavedItem[];
        edges: SavedEdge[];
        zones: TemplateZone[];
        layout: LayoutOverrides;
        speed: AnimationSpeed;
      };
      const next = withLayout({ ...tpl, zones: s.zones }, base, s.layout);
      templateRef.current = next;
      setTemplate(next);
      setNodes([
        ...buildZoneNodes(next, onZoneAdd, onZoneResize),
        ...itemsToNodes(next, s.items),
      ]);
      setEdges(s.edges.map(edgeFromSaved));
      setSpeedState(s.speed);
      setStatus("dirty");
    },
    [onZoneAdd, onZoneResize, setNodes, setEdges],
  );

  const undo = useCallback(() => {
    if (historyTimer.current !== null) captureNow(); // include a change still being debounced
    const h = history.current;
    if (h.index <= 0) return;
    h.index -= 1;
    const snap = h.stack[h.index];
    if (snap) restore(snap);
    syncHistoryState();
  }, [captureNow, restore]);

  const redo = useCallback(() => {
    const h = history.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    const snap = h.stack[h.index];
    if (snap) restore(snap);
    syncHistoryState();
  }, [restore]);

  // ----- clipboard -----
  /** The selected shapes, plus arrows whose both ends are selected. */
  const selectionPayload = useCallback((): ClipPayload | null => {
    const tpl = templateRef.current;
    if (!tpl) return null;
    const items = getNodes().filter((n) => isItemNode(n) && n.selected);
    if (items.length === 0) return null;
    const ids = new Set(items.map((n) => n.id));
    const clipItems: ClipItem[] = nodesToItems(items).map((it) => {
      const origin = it.zone ? zoneOrigin(tpl, it.zone) : { x: 0, y: 0 };
      return { ...it, ax: origin.x + it.x, ay: origin.y + it.y };
    });
    const edges = getEdges()
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map(edgeToSaved);
    return { flowmira: 1, items: clipItems, edges };
  }, [getNodes, getEdges]);

  // Repeated pastes of the same thing cascade instead of landing on top of each other.
  const pasteCount = useRef<{ key: string; n: number }>({ key: "", n: 0 });

  const pastePayload = useCallback(
    (payload: ClipPayload, cascade = true) => {
      const tpl = templateRef.current;
      if (!tpl || payload.items.length === 0) return;
      const key = JSON.stringify(payload.items.map((i) => [i.id, i.ax, i.ay]));
      pasteCount.current =
        pasteCount.current.key === key
          ? { key, n: pasteCount.current.n + 1 }
          : { key, n: 1 };
      const offset = cascade ? 24 * pasteCount.current.n : 0;

      beginStep();
      const idMap = new Map<string, string>();
      const known = new Set(tpl.zones.map((z) => z.id));
      const newNodes: AppNode[] = payload.items.map((it) => {
        const id = crypto.randomUUID();
        idMap.set(it.id, id);
        const size = { w: it.w ?? 160, h: it.h ?? 72 };
        const abs = { x: it.ax + offset, y: it.ay + offset };
        let zone: string | undefined;
        let pos = abs;
        if (tpl.zones.length) {
          const hit = zoneAt(tpl, {
            x: abs.x + size.w / 2,
            y: abs.y + size.h / 2,
          });
          // Landed in a column/lane? Use it. Otherwise keep the original one (or the first).
          zone =
            hit?.zone.id ??
            (it.zone && known.has(it.zone)
              ? it.zone
              : mustSnap(tpl)
                ? tpl.zones[0]?.id
                : undefined);
          if (zone) {
            const origin = zoneOrigin(tpl, zone);
            pos = clampInZone(
              tpl,
              { x: abs.x - origin.x, y: abs.y - origin.y },
              size,
              zone,
            );
          }
        }
        return {
          ...makeItemNode(tpl, { ...it, id, zone, x: pos.x, y: pos.y }),
          selected: true,
        };
      });
      const parentOf = new Map(newNodes.map((n) => [n.id, n.parentId]));
      const newEdges = payload.edges
        .map((e) => ({
          ...e,
          id: crypto.randomUUID(),
          source: idMap.get(e.source) ?? "",
          target: idMap.get(e.target) ?? "",
        }))
        .filter(
          (e) =>
            e.source &&
            e.target &&
            canConnect(tpl, parentOf.get(e.source), parentOf.get(e.target)),
        )
        .map((e) => ({ ...edgeFromSaved(e), selected: false }));

      setNodes((nds) => [
        ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
        ...newNodes,
      ]);
      setEdges((eds) => [
        ...eds.map((e) => (e.selected ? { ...e, selected: false } : e)),
        ...newEdges,
      ]);
      markDirty();
      scheduleGrow();
      endStep();
      const n = newNodes.length;
      flash(`Pasted ${n} ${n === 1 ? "shape" : "shapes"}`);
    },
    [setNodes, setEdges, markDirty, scheduleGrow, flash, beginStep, endStep],
  );

  const deleteSelection = useCallback(() => {
    const nodesToDelete = getNodes().filter((n) => isItemNode(n) && n.selected);
    const edgesToDelete = getEdges().filter((e) => e.selected);
    if (nodesToDelete.length || edgesToDelete.length)
      void deleteElements({ nodes: nodesToDelete, edges: edgesToDelete });
  }, [getNodes, getEdges, deleteElements]);

  const copySelection = useCallback(
    (clipboardData?: DataTransfer | null) => {
      const payload = selectionPayload();
      if (!payload) return false;
      remember(payload);
      if (clipboardData) {
        const { json, text } = encode(payload);
        clipboardData.setData(CLIP_MIME, json);
        clipboardData.setData("text/plain", text);
      }
      return true;
    },
    [selectionPayload],
  );

  const duplicateSelection = useCallback(() => {
    const payload = selectionPayload();
    if (payload) pastePayload(payload);
  }, [selectionPayload, pastePayload]);

  const selectAll = useCallback(() => {
    setNodes((nds) =>
      nds.map((n) => (isItemNode(n) ? { ...n, selected: true } : n)),
    );
    setEdges((eds) => eds.map((e) => ({ ...e, selected: true })));
  }, [setNodes, setEdges]);

  // Native copy/cut/paste events: they get clipboard access without a permission prompt,
  // and the data works across diagrams and browser tabs.
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target) || !copySelection(e.clipboardData)) return;
      e.preventDefault();
      const n = selectionPayload()?.items.length ?? 0;
      flash(`Copied ${n} ${n === 1 ? "shape" : "shapes"}`);
    };
    const onCut = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target) || !copySelection(e.clipboardData)) return;
      e.preventDefault();
      deleteSelection();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const payload = decode(e.clipboardData?.getData(CLIP_MIME)) ?? recall();
      if (!payload) return;
      e.preventDefault();
      pastePayload(payload);
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [copySelection, deleteSelection, pastePayload, selectionPayload, flash]);

  /** Stacking order: shapes later in the list are drawn on top. Zones always stay first. */
  const arrange = useCallback(
    (mode: ArrangeMode) => {
      const items = getNodes().filter(isItemNode);
      if (!items.some((n) => n.selected)) return;
      beginStep();
      setNodes((nds) => {
        const zones = nds.filter((n) => !isItemNode(n));
        const list = nds.filter(isItemNode);
        const sel = (n: AppNode) => Boolean(n.selected);
        let next: AppNode[] = [...list];
        if (mode === "front")
          next = [...list.filter((n) => !sel(n)), ...list.filter(sel)];
        else if (mode === "back")
          next = [...list.filter(sel), ...list.filter((n) => !sel(n))];
        else if (mode === "forward") {
          for (let i = next.length - 2; i >= 0; i--) {
            const a = next[i];
            const b = next[i + 1];
            if (a && b && sel(a) && !sel(b)) {
              next[i] = b;
              next[i + 1] = a;
            }
          }
        } else {
          for (let i = 1; i < next.length; i++) {
            const a = next[i];
            const b = next[i - 1];
            if (a && b && sel(a) && !sel(b)) {
              next[i] = b;
              next[i - 1] = a;
            }
          }
        }
        return [...zones, ...next];
      });
      markDirty();
      endStep();
    },
    [getNodes, setNodes, markDirty, beginStep, endStep],
  );

  // Keyboard: undo/redo, duplicate, select all (copy/cut/paste come from the events above).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isEditableTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      } else if (k === "d") {
        e.preventDefault();
        duplicateSelection();
      } else if (k === "a") {
        e.preventDefault();
        selectAll();
      }
      // Ctrl+] / Ctrl+[ forward/backward; with Shift: to front / to back.
      // (e.code: Shift changes e.key to "}" / "{" on most keyboards.)
      else if (e.code === "BracketRight") {
        e.preventDefault();
        arrange(e.shiftKey ? "front" : "forward");
      } else if (e.code === "BracketLeft") {
        e.preventDefault();
        arrange(e.shiftKey ? "back" : "backward");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, duplicateSelection, selectAll, arrange]);

  // ----- right-click menu -----
  const [menu, setMenu] = useState<MenuState | null>(null);
  const openMenu = useCallback(
    (
      e: { clientX: number; clientY: number; preventDefault: () => void },
      kind: MenuState["kind"],
    ) => {
      e.preventDefault();
      const box = canvasRef.current?.getBoundingClientRect();
      if (!box) return;
      setMenu({ x: e.clientX - box.left, y: e.clientY - box.top, kind });
    },
    [],
  );
  const menuActions = {
    copy: () => {
      // Fires the normal copy event (onCopy above), which also fills the system clipboard so
      // Ctrl+V works in other tabs. Fallback if the browser refuses.
      if (document.execCommand("copy")) return;
      if (copySelection()) flash("Copied");
    },
    cut: () => {
      menuActions.copy();
      deleteSelection();
    },
    paste: () => {
      const p = recall();
      if (p) pastePayload(p);
    },
    duplicate: duplicateSelection,
    delete: deleteSelection,
    selectAll,
    front: () => arrange("front"),
    back: () => arrange("back"),
  };

  const back = () => {
    if (
      status === "dirty" &&
      !window.confirm("You have unsaved changes. Leave without saving?")
    )
      return;
    onBack();
  };

  if (status === "loading")
    return <div className="p-12 text-center text-ink-2">Loading diagram…</div>;
  if (!template) {
    return (
      <div
        role="alert"
        className="flex items-center justify-center gap-3 p-12 text-danger"
      >
        Couldn't load this diagram: {error}
        <Button onClick={onBack}>Back to diagrams</Button>
      </div>
    );
  }

  const statusText: Record<Exclude<SaveStatus, "loading">, string> = {
    saved: "All changes saved",
    dirty: "Unsaved changes",
    saving: "Saving…",
    error,
  };
  const accent = template.accent ?? "var(--color-ink)";
  const statusColor: Record<Exclude<SaveStatus, "loading">, string> = {
    saved: "text-ink-2",
    dirty: "text-warn",
    saving: "text-ink-2",
    error: "text-danger",
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line bg-paper px-3.5 py-2.5">
        <span
          className="mr-0.5 border-r border-line pr-2 text-xl font-extrabold tracking-[-0.03em]"
          title={`Flowmira ${__APP_VERSION__}`}
        >
          Flowmira
        </span>
        <Button variant="ghost" onClick={back}>
          Diagrams
        </Button>
        <span
          className="rounded-[3px] px-2 py-[3px] text-[13px] font-extrabold text-white ring-1 ring-white/15"
          style={{ background: accent }}
        >
          {template.name}
        </span>
        <input
          className="min-w-40 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-lg font-bold hover:border-line focus:border-ink-2 focus:bg-field focus:outline-none"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            markDirty();
          }}
          aria-label="Diagram title"
        />
        <span role="status" className={cx("text-[13px]", statusColor[status])}>
          {statusText[status]}
        </span>
        <div
          className="flex overflow-hidden rounded border border-line"
          role="group"
          aria-label="History"
        >
          <button
            type="button"
            onClick={undo}
            disabled={!historyState.canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="cursor-pointer border-r border-line bg-field px-2 py-[7px] text-ink hover:bg-canvas disabled:cursor-default disabled:opacity-35 disabled:hover:bg-field"
          >
            <Undo2 className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!historyState.canRedo}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
            className="cursor-pointer bg-field px-2 py-[7px] text-ink hover:bg-canvas disabled:cursor-default disabled:opacity-35 disabled:hover:bg-field"
          >
            <Redo2 className="size-4" aria-hidden="true" />
          </button>
        </div>
        <ThemeSwitcher compact />
        <ExportMenu
          onExport={(kind) => void exportDiagram(kind)}
          busy={exporting}
          progress={exportProgress}
          canGif={hasAnimated}
        />
        <Button
          variant="primary"
          onClick={() => void save()}
          disabled={status === "saving"}
        >
          Save
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <Palette
          shapes={paletteOf(template)}
          connector={connector}
          onConnectorChange={setConnector}
          onAdd={onPaletteAdd}
          arrowMode={arrowMode}
          onToggleArrowMode={toggleArrowMode}
          showPersonas={offersPersonas(template)}
          speed={speed}
          onSpeedChange={setSpeed}
          defaultPersonaMode={
            template.shapes.item.defaultShape === "persona"
              ? "persona"
              : "avatar"
          }
        />
        {/* "arrow-mode" is a plain CSS hook: it styles React Flow internals (see styles.css) */}
        <div
          className={cx(
            "relative min-w-0 flex-1 max-md:min-h-[50vh]",
            arrowMode && "arrow-mode",
          )}
          ref={canvasRef}
        >
          {arrowMode && (
            <div
              role="status"
              className="absolute bottom-4 left-1/2 z-[5] flex -translate-x-1/2 items-center gap-3 rounded bg-ink py-2 pr-2 pl-3.5 text-[13.5px] font-semibold whitespace-nowrap text-on-ink shadow-lg"
            >
              {arrowSource
                ? "Now click the shape the arrow points to."
                : "Click the shape the arrow starts from."}
              <button
                type="button"
                onClick={toggleArrowMode}
                className="cursor-pointer rounded-[3px] bg-on-ink px-2.5 py-1 font-bold text-ink"
              >
                Done
              </button>
            </div>
          )}
          <AnimationSpeedContext.Provider value={speed}>
            <ReactFlow<AppNode, AppEdge>
              nodes={renderedNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              onNodeClick={onNodeClick}
              onPaneClick={() => {
                setArrowSource(null);
                setMenu(null);
              }}
              onNodeContextMenu={(e, node) => {
                if (!isItemNode(node)) {
                  openMenu(e, "pane");
                  return;
                }
                // Right-clicking an unselected shape selects just that shape.
                if (!node.selected) {
                  setNodes((nds) =>
                    nds.map((n) => ({ ...n, selected: n.id === node.id })),
                  );
                  setEdges((eds) =>
                    eds.map((ed) =>
                      ed.selected ? { ...ed, selected: false } : ed,
                    ),
                  );
                }
                openMenu(e, "selection");
              }}
              onSelectionContextMenu={(e) => openMenu(e, "selection")}
              onEdgeContextMenu={(e, edge) => {
                setEdges((eds) =>
                  eds.map((ed) => ({ ...ed, selected: ed.id === edge.id })),
                );
                openMenu(e, "edge");
              }}
              onPaneContextMenu={(e) => openMenu(e, "pane")}
              nodesDraggable={!arrowMode}
              isValidConnection={isValidConnection}
              connectionMode={ConnectionMode.Loose}
              connectionRadius={28}
              onNodeDragStart={beginStep}
              onNodeDragStop={(e, n, ns) => {
                onNodeDragStop(e, n, ns);
                endStep();
              }}
              onDragOver={onDragOver}
              onDrop={onDrop}
              deleteKeyCode={["Backspace", "Delete"]}
              // Keep the stacking order the user chose (Arrange), even while a shape is selected.
              elevateNodesOnSelect={false}
              zoomOnDoubleClick={false}
              snapToGrid
              snapGrid={[6, 6]}
              fitView={fitOnOpen}
              fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
              minZoom={0.2}
              colorMode={theme}
            >
              {guides && (
                <ViewportPortal>
                  {guides.x !== undefined && (
                    <div
                      className="align-guide align-guide--v"
                      style={{ transform: `translateX(${guides.x}px)` }}
                    />
                  )}
                  {guides.y !== undefined && (
                    <div
                      className="align-guide align-guide--h"
                      style={{ transform: `translateY(${guides.y}px)` }}
                    />
                  )}
                </ViewportPortal>
              )}
              <Background
                gap={24}
                size={1}
                color={theme === "dark" ? "#2a3540" : "#c7d0cc"}
              />
              <Controls showInteractive={false} />
            </ReactFlow>
          </AnimationSpeedContext.Provider>
          {menu && (
            <ContextMenu
              menu={menu}
              canPaste={recall() !== null}
              onClose={() => setMenu(null)}
              actions={menuActions}
            />
          )}
          {notice && (
            <div
              role="status"
              className="pointer-events-none absolute top-3.5 left-1/2 z-[6] -translate-x-1/2 rounded bg-ink px-3.5 py-2 text-[13.5px] font-semibold text-on-ink shadow-lg"
            >
              {notice}
            </div>
          )}
        </div>
        <Inspector
          template={template}
          node={selectedNode}
          edge={selectedNode ? undefined : selectedEdge}
          onNodeChange={updateItem}
          onEdgeChange={updateEdge}
          onDeleteNode={deleteItem}
          onDeleteEdge={deleteEdge}
          speed={speed}
          onSpeedChange={setSpeed}
          onArrange={arrange}
          zoneEditor={
            template.editableZones
              ? {
                  zones: template.zones,
                  counts: zoneCounts,
                  onChange: applyZones,
                }
              : undefined
          }
          sizeEditor={
            template.zones.length
              ? {
                  rows: layoutOf(template).type === "rows",
                  length:
                    layoutOf(template).type === "rows"
                      ? layoutOf(template).zoneWidth
                      : layoutOf(template).zoneHeight,
                  onLength: setLength,
                  onFit: fitToContent,
                  onReset: resetSizes,
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}

export default function Editor(props: EditorProps) {
  return (
    <ReactFlowProvider>
      <EditorCanvas {...props} />
    </ReactFlowProvider>
  );
}
