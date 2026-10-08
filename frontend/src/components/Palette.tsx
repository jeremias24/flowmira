import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { SHAPES, ShapeIcon, groupByCategory } from "../shapes";
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
import { RotateCcw } from "lucide-react";
import SpeedControl from "./SpeedControl";
import type { AnimationSpeed } from "../flowAnimation";

export const SHAPE_MIME = "application/x-flowmira-shape";

/** What the toolbox adds: a shape, plus an icon or persona preset for those shapes. */
export interface PaletteItem {
  shape: ShapeKey;
  icon?: IconKey;
  preset?: PersonaPresetKey;
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

interface PaletteProps {
  shapes: ShapeKey[];
  connector: EdgeData;
  onConnectorChange: (next: EdgeData) => void;
  onAdd: (item: PaletteItem) => void;
  arrowMode: boolean;
  onToggleArrowMode: () => void;
  showPersonas: boolean;
  defaultPersonaMode: PersonaMode;
  speed: AnimationSpeed;
  onSpeedChange: (speed: AnimationSpeed) => void;
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
  connector,
  onConnectorChange,
  onAdd,
  arrowMode,
  onToggleArrowMode,
  showPersonas,
  defaultPersonaMode,
  speed,
  onSpeedChange,
}: PaletteProps) {
  const [query, setQuery] = useState("");
  const [personaMode, setPersonaMode] =
    useState<PersonaMode>(defaultPersonaMode);
  const found = useMemo(() => searchIcons(query), [query]);

  const drag = (item: PaletteItem) => (e: DragEvent<HTMLButtonElement>) => {
    e.dataTransfer.setData(SHAPE_MIME, encodeDrag(item));
    e.dataTransfer.effectAllowed = "move";
  };
  const set = (patch: Partial<EdgeData>) =>
    onConnectorChange({ ...connector, ...patch });

  return (
    <aside
      aria-label="Toolbox"
      className="flex w-[212px] shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-paper px-3 pt-3.5 pb-5 max-md:max-h-[34vh] max-md:w-full max-md:border-r-0 max-md:border-b"
    >
      {/* ---------- Shapes ---------- */}
      <Section>
        <PanelTitle>Shapes</PanelTitle>
        {groupByCategory(shapes).map(({ category, keys }, gi, groups) => (
          <div key={category}>
            {/* Headings only when the template mixes categories */}
            {groups.length > 1 && (
              <h3
                className={cx(
                  "mb-1 text-[11.5px] font-bold tracking-wide text-ink-2 uppercase",
                  gi > 0 && "mt-3",
                )}
              >
                {category}
              </h3>
            )}
            <div className="grid grid-cols-3 gap-1">
              {keys.map((key) => (
                <Tile
                  key={key}
                  onDragStart={drag({ shape: key })}
                  onClick={() => onAdd({ shape: key })}
                  title={`${SHAPES[key].label}: drag onto the canvas, or click to add`}
                  className="group flex flex-col items-center gap-1 px-0.5 pt-2 pb-1.5 text-center text-[11px] leading-tight text-ink-2 hover:border-line hover:bg-canvas hover:text-ink"
                >
                  <ShapeIcon shape={key} />
                  <span>{SHAPES[key].label}</span>
                </Tile>
              ))}
            </div>
          </div>
        ))}
      </Section>

      {/* ---------- Arrows ---------- */}
      <Section>
        <PanelTitle>Arrows</PanelTitle>
        <button
          type="button"
          aria-pressed={arrowMode}
          onClick={onToggleArrowMode}
          title="Draw arrow: click a shape, then the shape it points to (Esc to stop)"
          className={cx(
            "mb-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded border p-2 font-bold",
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
        <span className="mb-1.5 block text-[12.5px] font-semibold text-ink-2">
          Speed <span className="font-normal">(all animated arrows)</span>
        </span>
        <SpeedControl value={speed} onChange={onSpeedChange} />
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

      {/* ---------- Personas ---------- */}
      {showPersonas && (
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
                  className="flex flex-col items-center gap-1 px-0.5 pt-1.5 pb-1 text-center text-[11px] leading-tight text-ink-2 hover:border-line hover:bg-canvas hover:text-ink"
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
      <Section>
        <PanelTitle>Icons</PanelTitle>
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
              <h3 className="mt-2.5 mb-1 text-[11.5px] font-bold tracking-wide text-ink-2 uppercase">
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
    </aside>
  );
}
