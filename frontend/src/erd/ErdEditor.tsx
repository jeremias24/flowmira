import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import {
  Code2,
  CopyPlus,
  Eye,
  LayoutGrid,
  PanelLeftClose,
  RefreshCw,
} from "lucide-react";
import { Button, cx } from "../components/ui";
import ThemeSwitcher from "../components/ThemeSwitcher";
import ExportMenu, { type ExportKind } from "../components/ExportMenu";
import { useTheme } from "../theme";
import { captureFlow, downloadUrl, safeFileName, savePdf } from "../exporting";
import { erdApi } from "./api";
import { parseDbml } from "./dbml";
import { TABLE_WIDTH, layoutTables } from "./layout";
import ConnectDialog from "./ConnectDialog";
import TableNode, { type TableNodeType } from "./TableNode";
import RelationEdge, { type RelationEdgeType } from "./RelationEdge";
import type { DbmlError, ErdDoc, ErdSchema } from "./types";

const nodeTypes: NodeTypes = { table: TableNode };
const edgeTypes: EdgeTypes = { relation: RelationEdge };
type Status = "loading" | "saved" | "dirty" | "saving" | "error";

interface ErdEditorProps {
  docId: number;
  onBack: () => void;
  /** Open another ERD (after "Make an editable copy"). */
  onOpen: (id: number) => void;
}

function ErdCanvas({ docId, onBack, onOpen }: ErdEditorProps) {
  const [doc, setDoc] = useState<ErdDoc | null>(null);
  const [title, setTitle] = useState("");
  const [dbml, setDbml] = useState("");
  const [schema, setSchema] = useState<ErdSchema>({ tables: [], refs: [] });
  const [parseError, setParseError] = useState<DbmlError | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [codeOpen, setCodeOpen] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNodeType>([]);
  const loaded = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const { fitView, getNodesBounds } = useReactFlow<
    TableNodeType,
    RelationEdgeType
  >();
  const { theme } = useTheme();
  const viewOnly = doc?.source === "database";

  const markDirty = useCallback(() => {
    if (loaded.current) setStatus("dirty");
  }, []);
  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((m) => (m === msg ? "" : m)), 3000);
  }, []);

  /** Show a parsed schema: keep where existing tables are, lay out new ones. */
  const showSchema = useCallback(
    (
      next: ErdSchema,
      savedLayout: Record<string, { x: number; y: number }>,
    ) => {
      const positions = layoutTables(next, { tables: savedLayout });
      setSchema(next);
      setNodes((current) =>
        next.tables.map((t) => {
          const prev = current.find((n) => n.id === t.id);
          return {
            id: t.id,
            type: "table",
            position: prev?.position ?? positions[t.id] ?? { x: 0, y: 0 },
            data: { table: t, active: false },
            selected: prev?.selected ?? false,
          };
        }),
      );
    },
    [setNodes],
  );

  // ----- load -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await erdApi.get(docId);
        if (cancelled) return;
        setDoc(d);
        setTitle(d.title);
        setDbml(d.dbml);
        const parsed = await parseDbml(d.dbml);
        if (cancelled) return;
        if ("schema" in parsed)
          showSchema(parsed.schema, d.layout.tables ?? {});
        else setParseError(parsed.error);
        setStatus("saved");
        window.setTimeout(() => {
          loaded.current = true;
          void fitView({ padding: 0.1, maxZoom: 1 });
        }, 50);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, showSchema, fitView]);

  // ----- live parsing while typing (debounced) -----
  useEffect(() => {
    if (!loaded.current || viewOnly) return;
    const t = window.setTimeout(async () => {
      const parsed = await parseDbml(dbml);
      if ("schema" in parsed) {
        setParseError(null);
        const current = Object.fromEntries(
          nodes.map((n) => [n.id, n.position]),
        );
        showSchema(parsed.schema, current);
      } else {
        setParseError(parsed.error); // keep showing the last valid diagram
      }
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbml]);

  // ----- relationships, routed from the closest sides of the two tables -----
  const selectedIds = useMemo(
    () => new Set(nodes.filter((n) => n.selected).map((n) => n.id)),
    [nodes],
  );
  const edges = useMemo<RelationEdgeType[]>(() => {
    const pos = new Map(nodes.map((n) => [n.id, n.position]));
    const out: RelationEdgeType[] = [];
    for (const r of schema.refs) {
      const a = pos.get(r.from.table);
      const b = pos.get(r.to.table);
      const aCol = r.from.columns[0];
      const bCol = r.to.columns[0];
      if (!a || !b || !aCol || !bCol) continue;
      const aLeftOfB = a.x + TABLE_WIDTH / 2 <= b.x + TABLE_WIDTH / 2;
      const self = r.from.table === r.to.table;
      out.push({
        id: r.id,
        type: "relation",
        source: r.from.table,
        target: r.to.table,
        sourceHandle: `${aCol}-${self || aLeftOfB ? "r" : "l"}`,
        targetHandle: `${bCol}-${self ? "r" : aLeftOfB ? "l" : "r"}`,
        selectable: false,
        data: {
          fromCard: r.from.card,
          toCard: r.to.card,
          name: r.name,
          active: selectedIds.has(r.from.table) || selectedIds.has(r.to.table),
        },
      });
    }
    return out;
  }, [schema.refs, nodes, selectedIds]);

  // Highlight tables linked to the selected one.
  const linked = useMemo(() => {
    const s = new Set<string>();
    for (const e of edges)
      if (e.data?.active) {
        s.add(e.source);
        s.add(e.target);
      }
    return s;
  }, [edges]);
  const displayNodes = useMemo(
    () =>
      nodes.map((n) =>
        n.data.active === (linked.has(n.id) && !n.selected)
          ? n
          : {
              ...n,
              data: { ...n.data, active: linked.has(n.id) && !n.selected },
            },
      ),
    [nodes, linked],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<TableNodeType>[]) => {
      onNodesChange(changes);
      if (changes.some((c) => c.type === "position" && !c.dragging))
        markDirty();
    },
    [onNodesChange, markDirty],
  );

  // ----- actions -----
  const save = useCallback(async () => {
    if (!doc) return;
    setStatus("saving");
    try {
      const layout = {
        tables: Object.fromEntries(
          nodes.map((n) => [
            n.id,
            { x: Math.round(n.position.x), y: Math.round(n.position.y) },
          ]),
        ),
      };
      const updated = await erdApi.update(doc.id, {
        title: title.trim() || "Untitled ERD",
        layout,
        ...(viewOnly ? {} : { dbml }),
      });
      setDoc(updated);
      setStatus("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [doc, nodes, title, dbml, viewOnly]);

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

  const autoArrange = () => {
    const positions = layoutTables(schema, {}, true);
    setNodes((ns) =>
      ns.map((n) => ({ ...n, position: positions[n.id] ?? n.position })),
    );
    markDirty();
    window.setTimeout(
      () => void fitView({ padding: 0.1, maxZoom: 1, duration: 300 }),
      30,
    );
  };

  const makeCopy = async () => {
    const layout = {
      tables: Object.fromEntries(nodes.map((n) => [n.id, n.position])),
    };
    const copy = await erdApi.create({
      title: `${title} (editable copy)`,
      dbml,
      layout,
      source: "dbml",
    });
    onOpen(copy.id);
  };

  const exportErd = async (kind: ExportKind) => {
    const container = canvasRef.current;
    if (!container || nodes.length === 0) {
      flash("Nothing to export yet.");
      return;
    }
    setExporting(true);
    try {
      const img = await captureFlow(container, getNodesBounds(nodes), {
        transparent: kind === "png-transparent",
        pixelRatio: kind === "pdf" ? 3 : 2,
      });
      if (!img) return;
      const base = safeFileName(title);
      if (kind === "pdf") await savePdf(img, title, `${base}.pdf`);
      else
        downloadUrl(
          img.canvas.toDataURL("image/png"),
          `${base}${kind === "png-transparent" ? "-transparent" : ""}.png`,
        );
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
      setStatus("error");
    } finally {
      setExporting(false);
    }
  };

  const back = () => {
    if (
      status === "dirty" &&
      !window.confirm("You have unsaved changes. Leave without saving?")
    )
      return;
    onBack();
  };

  // ----- code editor helpers -----
  const lines = useMemo(() => dbml.split("\n").length, [dbml]);
  const onCodeKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && !viewOnly) {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: a, selectionEnd: b } = el;
      const next = `${dbml.slice(0, a)}  ${dbml.slice(b)}`;
      setDbml(next);
      markDirty();
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = a + 2;
      });
    }
  };

  if (status === "loading")
    return <div className="p-12 text-center text-ink-2">Loading ERD…</div>;
  if (!doc) {
    return (
      <div
        role="alert"
        className="flex items-center justify-center gap-3 p-12 text-danger"
      >
        Couldn't load this ERD: {error}
        <Button onClick={onBack}>Back</Button>
      </div>
    );
  }

  const statusText: Record<Exclude<Status, "loading">, string> = {
    saved: "All changes saved",
    dirty: "Unsaved changes",
    saving: "Saving…",
    error,
  };
  const src = doc.source_info;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line bg-paper px-3.5 py-2.5">
        <span className="mr-0.5 border-r border-line pr-2 text-xl font-extrabold tracking-[-0.03em]">
          Flowmira
        </span>
        <Button variant="ghost" onClick={back}>
          Diagrams
        </Button>
        <span className="rounded-[3px] bg-[#2B5F9E] px-2 py-[3px] text-[13px] font-extrabold text-white">
          ERD
        </span>
        {viewOnly && (
          <span
            className="flex items-center gap-1 rounded-[3px] border border-line px-2 py-[2px] text-[12.5px] font-semibold text-ink-2"
            title="Read from a live database. The structure can't be edited here."
          >
            <Eye className="size-3.5" aria-hidden="true" /> View only
          </span>
        )}
        <input
          className="min-w-40 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-lg font-bold hover:border-line focus:border-ink-2 focus:bg-field focus:outline-none"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            markDirty();
          }}
          aria-label="ERD title"
        />
        <span
          role="status"
          className={cx(
            "text-[13px]",
            status === "dirty"
              ? "text-warn"
              : status === "error"
                ? "text-danger"
                : "text-ink-2",
          )}
        >
          {statusText[status]}
        </span>
        <ThemeSwitcher compact />
        <ExportMenu
          onExport={(k) => void exportErd(k)}
          busy={exporting}
          canGif={false}
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
        {codeOpen && (
          <section
            aria-label="DBML editor"
            className="flex w-[420px] shrink-0 flex-col border-r border-line bg-paper max-md:h-[40vh] max-md:w-full max-md:border-r-0 max-md:border-b"
          >
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Code2 className="size-4 text-ink-2" aria-hidden="true" />
              <span className="text-[13px] font-bold">DBML</span>
              {viewOnly ? (
                <span className="ml-auto text-[12px] text-ink-2">
                  read from database
                </span>
              ) : (
                <a
                  className="ml-auto text-[12px] text-ink-2 underline"
                  href="https://dbml.dbdiagram.io/docs"
                  target="_blank"
                  rel="noreferrer"
                >
                  syntax
                </a>
              )}
              <button
                type="button"
                onClick={() => setCodeOpen(false)}
                title="Hide code"
                aria-label="Hide code"
                className="cursor-pointer rounded p-1 text-ink-2 hover:bg-canvas hover:text-ink"
              >
                <PanelLeftClose className="size-4" aria-hidden="true" />
              </button>
            </div>
            {viewOnly && src && (
              <div className="flex flex-col gap-2 border-b border-line bg-canvas px-3 py-2.5 text-[12.5px] text-ink-2">
                <span>
                  From <b className="text-ink">{src.database}</b> on{" "}
                  {src.host || "file"}
                  {src.schema ? `, schema ${src.schema}` : ""} ({src.engine}).
                  Last read {new Date(doc.updated_at).toLocaleString()}.
                </span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setRefreshing(true)}>
                    <RefreshCw className="size-3.5" aria-hidden="true" />{" "}
                    Refresh from database
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void makeCopy()}
                  >
                    <CopyPlus className="size-3.5" aria-hidden="true" /> Make an
                    editable copy
                  </Button>
                </div>
              </div>
            )}
            <div className="relative flex min-h-0 flex-1 overflow-hidden font-mono text-[13px] leading-[20px]">
              <div
                ref={gutterRef}
                aria-hidden="true"
                className="w-11 shrink-0 select-none overflow-hidden border-r border-line bg-canvas py-2 pr-2 text-right text-ink-2"
              >
                {Array.from({ length: lines }, (_, i) => (
                  <div
                    key={i}
                    className={
                      parseError?.line === i + 1
                        ? "bg-danger text-white"
                        : undefined
                    }
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              <textarea
                className="min-h-0 flex-1 resize-none bg-field px-3 py-2 text-ink outline-none"
                value={dbml}
                readOnly={viewOnly}
                spellCheck={false}
                wrap="off"
                aria-label="DBML code"
                aria-invalid={parseError ? true : undefined}
                onKeyDown={onCodeKey}
                onScroll={(e) => {
                  if (gutterRef.current)
                    gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                }}
                onChange={(e) => {
                  setDbml(e.target.value);
                  markDirty();
                }}
              />
            </div>
            {parseError && (
              <p
                role="alert"
                className="m-0 border-t border-danger/40 bg-danger-soft px-3 py-2 text-[12.5px] text-danger"
              >
                {parseError.line
                  ? `Line ${parseError.line}${parseError.column ? `:${parseError.column}` : ""}: `
                  : ""}
                {parseError.message}
              </p>
            )}
          </section>
        )}

        <div
          ref={canvasRef}
          className="relative min-w-0 flex-1 max-md:min-h-[50vh]"
        >
          <div className="absolute top-3 left-3 z-10 flex gap-2">
            {!codeOpen && (
              <Button size="sm" onClick={() => setCodeOpen(true)}>
                <Code2 className="size-3.5" aria-hidden="true" /> Show code
              </Button>
            )}
            <Button
              size="sm"
              onClick={autoArrange}
              title="Lay out all tables automatically"
            >
              <LayoutGrid className="size-3.5" aria-hidden="true" />{" "}
              Auto-arrange
            </Button>
          </div>
          <ReactFlow<TableNodeType, RelationEdgeType>
            nodes={displayNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={handleNodesChange}
            nodesConnectable={false}
            // Column connection points are all "source" type: Loose mode lets relationships
            // end on any of them (Strict mode would draw no lines at all).
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={null}
            elevateNodesOnSelect
            minZoom={0.1}
            colorMode={theme}
            proOptions={{ hideAttribution: false }}
          >
            <Background
              gap={24}
              size={1}
              color={theme === "dark" ? "#2a3540" : "#c7d0cc"}
            />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
          {schema.tables.length === 0 && !parseError && (
            <p className="pointer-events-none absolute inset-0 grid place-items-center text-ink-2">
              {viewOnly
                ? "This database has no tables in that schema."
                : "Write a Table in DBML on the left to start."}
            </p>
          )}
          {notice && (
            <div
              role="status"
              className="pointer-events-none absolute top-3.5 left-1/2 z-[6] -translate-x-1/2 rounded bg-ink px-3.5 py-2 text-[13.5px] font-semibold text-on-ink shadow-lg"
            >
              {notice}
            </div>
          )}
          <p className="pointer-events-none absolute right-3 bottom-3 z-10 m-0 rounded bg-paper/90 px-2 py-1 text-[12px] text-ink-2">
            {schema.tables.length} tables · {schema.refs.length} relationships
          </p>
        </div>
      </div>

      {refreshing && (
        <ConnectDialog
          title="Refresh from database"
          submitLabel="Read schema again"
          initial={src}
          onClose={() => setRefreshing(false)}
          onSubmit={async (form) => {
            const updated = await erdApi.refresh(doc.id, form);
            setRefreshing(false);
            setDoc(updated);
            setDbml(updated.dbml);
            const parsed = await parseDbml(updated.dbml);
            if ("schema" in parsed)
              showSchema(
                parsed.schema,
                Object.fromEntries(nodes.map((n) => [n.id, n.position])),
              );
            flash("Schema refreshed from the database.");
          }}
        />
      )}
    </div>
  );
}

export default function ErdEditor(props: ErdEditorProps) {
  return (
    <ReactFlowProvider>
      <ErdCanvas {...props} />
    </ReactFlowProvider>
  );
}
