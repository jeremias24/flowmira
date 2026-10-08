import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react"; // ── FIX ── + useRef
import { SHAPES, ShapeIcon, groupByCategory, type ShapeCategory } from "../shapes"; // ── FIX ── + ShapeCategory
import { ICONS, ICON_GROUPS, searchIcons, type IconKey } from "../icons";
import {
  Avatar,
  PERSONA_PRESETS,
  PERSONA_PRESET_KEYS,
  isPresetKey,
  type PersonaPresetKey,
} from "../avatars";
import type { ArrowMode, EdgeData, EdgeKind, ShapeKey } from "../types";
import { Hint, PanelTitle, SegButton, Segmented, cx, inputClass } from "./ui";
import ColorPicker from "./ColorPicker";
import { ARROW_COLORS } from "../colors";
import { ChevronDown, ImagePlus, RotateCcw } from "lucide-react"; // ── FIX ── + ImagePlus, ChevronDown
// ── FIX ── SpeedControl removed: speed is a whole-diagram setting, kept in the Inspector only
import { END_MARKS, isEndMark } from "../crowsFoot"; // ── NEW ──
import { IMAGE_ACCEPT, type ImageAsset } from "../images"; // ── NEW ──

export const SHAPE_MIME = "application/x-flowmira-shape";

/** What the toolbox adds: a shape, plus an icon or persona preset for those shapes. */
export interface PaletteItem {
  shape: ShapeKey;
  icon?: IconKey;
  preset?: PersonaPresetKey;
  image?: ImageAsset; // ── NEW ── shape "image": never in a drag payload, only added from a file
}

/** Drag payload: "process", "icon:user", "avatar:manager", "persona:customer". */
export function encodeDrag(item: PaletteItem): string {
  const extra = item.icon ?? item.preset;
  return extra ? `${item.shape}:${extra}` : item.shape;
}

export function decodeDrag(raw: string): PaletteItem | null {
  const [shape, extra] = raw.split(":");
  if (!shape || !(shape in SHAPES)) return null;
  if (shape === "icon")
    return extra && extra in ICONS ? { shape, icon: extra as IconKey } : null;
  if (shape === "avatar" || shape === "persona")
    return { shape, preset: isPresetKey(extra) ? extra : "customer" };
  return { shape: shape as ShapeKey };
}

export type PersonaMode = "avatar" | "persona";

// ── NEW ── Toolbox categories the user folded, per diagram type, remembered in this browser.
const foldKey = (templateKey: string) => `flowmira-toolbox-folded:${templateKey}`;
function readFolded(templateKey: string): ShapeCategory[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(foldKey(templateKey)) ?? "[]");
    return Array.isArray(v) ? v.filter((c): c is ShapeCategory => typeof c === "string") : [];
  } catch {
    return [];
  }
}
function saveFolded(templateKey: string, folded: ShapeCategory[]) {
  try {
    localStorage.setItem(foldKey(templateKey), JSON.stringify(folded));
  } catch {
    // private window or storage blocked: folding still works until the page is closed
  }
}

// ── NEW ── The toolbox is split into tabs so icons aren't buried under the arrow settings.
export type ToolTab = "shapes" | "icons" | "arrows";
export const TOOL_TABS: { value: ToolTab; label: string }[] = [
  { value: "shapes", label: "Shapes" },
  { value: "icons", label: "Icons" },
  { value: "arrows", label: "Arrows" },
];

interface PaletteProps {
  shapes: ShapeKey[];
  templateKey: string; // ── NEW ── which diagram type, for remembering folded categories
  connector: EdgeData;
  onConnectorChange: (next: EdgeData) => void;
  onAdd: (item: PaletteItem) => void;
  arrowMode: boolean;
  onToggleArrowMode: () => void;
  showPersonas: boolean;
  defaultPersonaMode: PersonaMode;
  // ── NEW ── open tab (owned by the editor so the folded rail can open a tab directly)
  tab: ToolTab;
  onTabChange: (tab: ToolTab) => void;
  // ── NEW ── hop arcs where arrows cross (whole diagram)
  lineHops: boolean;
  onLineHopsChange: (on: boolean) => void;
  // ── NEW ── pictures chosen with the file picker
  onAddImages: (files: File[]) => void;
}

const LINE_KINDS: { value: EdgeKind; label: string; icon: string }[] = [
  { value: "straight", label: "Straight", icon: "M4,20 L36,4" },
  { value: "elbow", label: "Elbow", icon: "M4,20 H20 V4 H36" },
  { value: "curved", label: "Curved", icon: "M4,20 C20,20 20,4 36,4" },
];

const ARROWS: { value: ArrowMode; label: string }[] = [
  { value: "end", label: "One arrowhead" },
  { value: "both", label: "Arrowheads on both ends" },
  { value: "none", label: "No arrowheads" },
];

function ToolIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 40 24"
      className="h-5 w-9"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function ArrowIcon({ mode }: { mode: ArrowMode }) {
  return (
    <ToolIcon>
      <path d="M6,12 H34" />
      {mode !== "none" && (
        <path d="M28,7 L35,12 L28,17 Z" fill="currentColor" stroke="none" />
      )}
      {mode === "both" && (
        <path d="M12,7 L5,12 L12,17 Z" fill="currentColor" stroke="none" />
      )}
    </ToolIcon>
  );
}

/** A draggable, clickable toolbox tile. */
function Tile({
  onDragStart,
  onClick,
  title,
  ariaLabel,
  className,
  children,
}: {
  onDragStart: (e: DragEvent<HTMLButtonElement>) => void;
  onClick: () => void;
  title: string;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={cx(
        "cursor-grab rounded border border-transparent active:cursor-grabbing",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <section className="flex flex-col">{children}</section>;
}

export default function Palette({
  shapes,
  templateKey, // ── NEW ──
  connector,
  onConnectorChange,
  onAdd,
  arrowMode,
  onToggleArrowMode,
  showPersonas,
  defaultPersonaMode,
  tab, // ── NEW ──
  onTabChange, // ── NEW ──
  lineHops, // ── NEW ──
  onLineHopsChange, // ── NEW ──
  onAddImages, // ── NEW ──
}: PaletteProps) {
  const imageInput = useRef<HTMLInputElement>(null); // ── NEW ──
  const [query, setQuery] = useState("");
  const [personaMode, setPersonaMode] =
    useState<PersonaMode>(defaultPersonaMode);
  const found = useMemo(() => searchIcons(query), [query]);
  // ── NEW ── folded toolbox categories
  const [folded, setFolded] = useState<ShapeCategory[]>(() => readFolded(templateKey));
  const toggleFold = (category: ShapeCategory) => {
    const next = folded.includes(category)
      ? folded.filter((c) => c !== category)
      : [...folded, category];
    setFolded(next);
    saveFolded(templateKey, next);
  };

  const drag = (item: PaletteItem) => (e: DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData(SHAPE_MIME, encodeDrag(item));
    e.dataTransfer.effectAllowed = "move";
  };
  const set = (patch: Partial<EdgeData>) =>
    onConnectorChange({ ...connector, ...patch });

  return (
    // ── FIX ── side border comes from SideDock; the tool and tabs stay at the top and only
    // the tab's content scrolls. Narrow screens: a strip above the canvas, as before.
    <aside
      aria-label="Toolbox"
      className="flex min-h-0 w-[248px] flex-col bg-paper md:flex-1 max-md:max-h-[34vh] max-md:w-full max-md:shrink-0 max-md:border-b max-md:border-line"
    >
      <div className="shrink-0 border-b border-line px-3 pt-3 pb-2.5">
        {/* ── FIX ── Draw arrow moved out of the Arrows section: always visible */}
        <button
          type="button"
          aria-pressed={arrowMode}
          onClick={onToggleArrowMode}
          title="Draw arrow: click a shape, then the shape it points to (Esc to stop)"
          className={cx(
            "mb-2.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded border p-2 font-bold",
            arrowMode
              ? "border-ink bg-mark text-[#16222e]"
              : "border-line bg-field text-ink hover:border-ink-2",
          )}
        >
          <svg
            viewBox="0 0 40 24"
            className="h-5 w-9"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path d="M5,19 L33,5" />
            <path d="M26,4 L35,4 L31,12 Z" fill="currentColor" stroke="none" />
          </svg>
          {arrowMode ? "Drawing arrows" : "Draw arrow"}
        </button>
        {/* ── NEW ── tabs */}
        <div role="tablist" aria-label="Toolbox sections" className="grid grid-cols-3 overflow-hidden rounded border border-line">
          {TOOL_TABS.map((t, i) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              id={`tool-tab-${t.value}`}
              aria-selected={tab === t.value}
              aria-controls="tool-panel"
              onClick={() => onTabChange(t.value)}
              className={cx(
                "cursor-pointer py-1.5 text-[13px] font-semibold",
                i > 0 && "border-l border-line",
                tab === t.value ? "bg-ink text-on-ink" : "bg-field text-ink hover:bg-canvas",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div
        id="tool-panel"
        role="tabpanel"
        aria-labelledby={`tool-tab-${tab}`}
        // ── FIX ── "relative": the sr-only labels (position: absolute) stay inside this
        // scroller. Without it they're placed against the page and make the page taller
        // than the window (audit-notes/ui-layout-review.md, F8).
        className="relative flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pt-3.5 pb-5"
      >
      {/* ---------- Image ---------- */}
      {/* ── NEW ── every template gets this, so no template file changes */}
      {tab === "shapes" && (
      <Section>
        <button
          type="button"
          onClick={() => imageInput.current?.click()}
          title="Add a picture from your computer"
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded border border-line bg-field p-2 font-bold text-ink hover:border-ink-2"
        >
          <ImagePlus className="size-5" aria-hidden="true" />
          Add image
        </button>
        <input
          ref={imageInput}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          hidden
          aria-label="Choose pictures to add"
          onChange={(e) => {
            onAddImages([...(e.target.files ?? [])]);
            e.target.value = ""; // so the same file can be picked again
          }}
        />
        <div className="mt-1.5">
          <Hint>Or paste a screenshot, or drop a picture on the canvas.</Hint>
        </div>
      </Section>
      )}

      {/* ---------- Shapes ---------- */}
      {tab === "shapes" && (
      <Section>
        {/* ── FIX ── no "Shapes" title: the tab already says it */}
        {groupByCategory(shapes).map(({ category, keys }, gi, groups) => {
          // ── FIX ── a heading folds its category away and back (only when there's more than one)
          const isFolded = groups.length > 1 && folded.includes(category);
          return (
          <div key={category}>
            {/* Headings only when the template mixes categories */}
            {groups.length > 1 && (
              <h3 className={cx("m-0 mb-1", gi > 0 && "mt-3")}>
                <button
                  type="button"
                  aria-expanded={!isFolded}
                  onClick={() => toggleFold(category)}
                  title={isFolded ? `Show the ${category} shapes` : `Hide the ${category} shapes`}
                  className="flex w-full cursor-pointer items-center gap-1 rounded px-0.5 py-0.5 text-left text-[12px] font-bold tracking-wide text-ink-2 uppercase hover:bg-canvas hover:text-ink" // ── FIX ── was 11.5px
                >
                  <ChevronDown
                    className={cx("size-3.5 shrink-0 transition-transform", isFolded && "-rotate-90")}
                    aria-hidden="true"
                  />
                  <span className="flex-1">{category}</span>
                  {isFolded && (
                    <span className="font-semibold tracking-normal normal-case">
                      {keys.length} hidden
                    </span>
                  )}
                </button>
              </h3>
            )}
            {!isFolded && (
            <div className="grid grid-cols-3 gap-1">
              {keys.map((key) => (
                <Tile
                  key={key}
                  onDragStart={drag({ shape: key })}
                  onClick={() => onAdd({ shape: key })}
                  title={`${SHAPES[key].label}: drag onto the canvas, or click to add`}
                  // ── FIX ── 12px labels (was 11px); a word too long for the tile is hyphenated
                  className="group flex flex-col items-center gap-1 px-0.5 pt-2 pb-1.5 text-center text-[12px] leading-tight hyphens-auto text-ink-2 hover:border-line hover:bg-canvas hover:text-ink"
                >
                  <ShapeIcon shape={key} />
                  <span className="max-w-full">{SHAPES[key].label}</span>
                </Tile>
              ))}
            </div>
            )}
          </div>
          );
        })}
      </Section>
      )}

      {/* ---------- Arrows ---------- */}
      {tab === "arrows" && (
      <Section>
        {/* ── FIX ── says plainly that these are defaults for arrows drawn next */}
        <PanelTitle>New arrow style</PanelTitle>
        <Hint>
          Used for the arrows you draw next. To change an arrow that&apos;s already
          there, select it.
        </Hint>
        <Hint>
          Click Draw arrow, then click two shapes. Or drag from a dot on a
          shape&apos;s edge onto another shape.
        </Hint>
        <Segmented label="Line style">
          {LINE_KINDS.map((k) => (
            <SegButton
              key={k.value}
              pressed={connector.kind === k.value}
              onClick={() => set({ kind: k.value })}
              title={k.label}
            >
              <ToolIcon>
                <path d={k.icon} />
              </ToolIcon>
              <span className="sr-only">{k.label}</span>
            </SegButton>
          ))}
        </Segmented>
        {/* ── NEW ── where two arrows cross without connecting */}
        <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-2">
          Where arrows cross <span className="font-normal">(all arrows)</span>
        </span>
        <Segmented label="Where arrows cross">
          <SegButton
            pressed={lineHops}
            onClick={() => onLineHopsChange(true)}
            title="Hop: one arrow jumps over the other (not connected)"
          >
            <ToolIcon>
              <path d="M20,2 V22 M4,12 H16 A4,4 0 0 1 24,12 H36" />
            </ToolIcon>
            <span className="sr-only">Hop over</span>
          </SegButton>
          <SegButton
            pressed={!lineHops}
            onClick={() => onLineHopsChange(false)}
            title="Plain: arrows simply cross"
          >
            <ToolIcon>
              <path d="M20,2 V22 M4,12 H36" />
            </ToolIcon>
            <span className="sr-only">Plain crossing</span>
          </SegButton>
        </Segmented>
        <Segmented label="Arrowheads">
          {ARROWS.map((a) => (
            <SegButton
              key={a.value}
              pressed={connector.arrow === a.value}
              onClick={() => set({ arrow: a.value })}
              title={a.label}
            >
              <ArrowIcon mode={a.value} />
              <span className="sr-only">{a.label}</span>
            </SegButton>
          ))}
        </Segmented>
        {/* ── NEW ── crow's-foot (cardinality) ends for new arrows */}
        <div className="mb-2.5 grid grid-cols-2 gap-1.5">
          {(
            [
              ["startMark", "Crow's foot: start"],
              ["endMark", "Crow's foot: end"],
            ] as const
          ).map(([key, text]) => (
            <label key={key} className="flex flex-col gap-1 text-[12px] font-semibold text-ink-2">
              {text}
              <select
                className="w-full rounded border border-line bg-field px-1.5 py-1 text-[12.5px] font-normal text-ink"
                value={connector[key] ?? ""}
                onChange={(e) => set({ [key]: isEndMark(e.target.value) ? e.target.value : undefined })}
                title="Replaces the arrowhead at this end of new arrows"
              >
                <option value="">None</option>
                {END_MARKS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
          ))}
        </div>
        <Segmented label="New arrow animation">
          {(
            [
              ["none", "Still"],
              ["dashes", "Dashes"],
              ["dots", "Dots"],
            ] as const
          ).map(([value, text]) => (
            <SegButton
              key={value}
              pressed={(connector.animation ?? "none") === value}
              onClick={() => set({ animation: value })}
              title={
                value === "none"
                  ? "No animation"
                  : `Animated: ${text.toLowerCase()} (exports to GIF)`
              }
            >
              {text}
            </SegButton>
          ))}
        </Segmented>
        {/* ── FIX ── Speed removed here: it's in the Inspector when an animated arrow is selected */}
        <div className="mb-2.5">
          <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-2">
            Color
          </span>
          <ColorPicker
            compact
            label="New arrow color"
            value={connector.color}
            onChange={(color) => set({ color })}
            groups={[{ options: ARROW_COLORS }]}
            reset={{
              label: "Default",
              value: undefined,
              title: "Default grey",
              icon: <RotateCcw className="size-3" aria-hidden="true" />,
            }}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            className="size-4 accent-ink"
            checked={connector.dashed}
            onChange={(e) => set({ dashed: e.target.checked })}
          />
          <span>Dashed line</span>
        </label>
      </Section>
      )}

      {/* ---------- Personas (Shapes tab) ---------- */}
      {tab === "shapes" && showPersonas && (
        <Section>
          <PanelTitle>Personas</PanelTitle>
          <Segmented label="Add personas as">
            <SegButton
              pressed={personaMode === "avatar"}
              onClick={() => setPersonaMode("avatar")}
            >
              Avatar
            </SegButton>
            <SegButton
              pressed={personaMode === "persona"}
              onClick={() => setPersonaMode("persona")}
            >
              Card
            </SegButton>
          </Segmented>
          <Hint>
            {personaMode === "avatar"
              ? "A person with a caption. Drag or click to add."
              : "A persona card with name, role, goals and pain points."}
          </Hint>
          <div className="grid grid-cols-3 gap-1">
            {PERSONA_PRESET_KEYS.map((k) => {
              const p = PERSONA_PRESETS[k];
              return (
                <Tile
                  key={k}
                  onDragStart={drag({ shape: personaMode, preset: k })}
                  onClick={() => onAdd({ shape: personaMode, preset: k })}
                  title={`${p.label}: drag onto the canvas, or click to add`}
                  ariaLabel={`${p.label} ${personaMode === "avatar" ? "avatar" : "persona card"}`}
                  className="flex flex-col items-center gap-1 px-0.5 pt-1.5 pb-1 text-center text-[12px] leading-tight text-ink-2 hover:border-line hover:bg-canvas hover:text-ink" // ── FIX ── was 11px
                >
                  <span className="block size-10">
                    <Avatar spec={p.spec} />
                  </span>
                  <span>{p.label}</span>
                </Tile>
              );
            })}
          </div>
        </Section>
      )}

      {/* ---------- Icons ---------- */}
      {tab === "icons" && (
      <Section>
        {/* ── FIX ── no "Icons" title: the tab already says it */}
        <input
          type="search"
          className={cx(inputClass, "mb-1.5 py-1.5 text-[13px]")}
          placeholder="Search icons (user, truck…)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search icons"
        />
        {found.length === 0 && <Hint>No icons match “{query}”.</Hint>}
        {ICON_GROUPS.map((group) => {
          const keys = found.filter((k) => ICONS[k].group === group);
          if (keys.length === 0) return null;
          return (
            <div key={group}>
              <h3 className="mt-2.5 mb-1 text-[12px] font-bold tracking-wide text-ink-2 uppercase">
                {group}
              </h3>
              <div className="grid grid-cols-5 gap-0.5">
                {keys.map((k) => {
                  const { Icon, label } = ICONS[k];
                  return (
                    <Tile
                      key={k}
                      onDragStart={drag({ shape: "icon", icon: k })}
                      onClick={() => onAdd({ shape: "icon", icon: k })}
                      title={`${label}: drag onto the canvas, or click to add`}
                      ariaLabel={label}
                      className="grid aspect-square place-items-center text-ink hover:border-ink hover:bg-mark hover:text-[#16222e]"
                    >
                      <Icon
                        className="size-[22px]"
                        strokeWidth={1.7}
                        aria-hidden="true"
                      />
                    </Tile>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Section>
      )}
      </div>
    </aside>
  );
}
