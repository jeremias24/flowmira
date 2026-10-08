import type { CSSProperties, ReactNode } from "react";
import { SHAPES, groupByCategory } from "../shapes";
import ColorPicker from "./ColorPicker";
import { ARROW_COLORS, NO_FILL, SOFT_FILLS, STRONG_FILLS } from "../colors";
import { Ban, BringToFront, RotateCcw, SendToBack, ArrowUpToLine, ArrowDownToLine } from "lucide-react";
import { paletteOf } from "../templateEngine";
import { DEFAULT_ICON, ICONS, ICON_GROUPS, ICON_KEYS, type IconKey } from "../icons";
import {
  ACCESSORIES, ACCESSORY_LABEL, AVATAR_BGS, Avatar, DEFAULT_AVATAR, HAIR_COLORS, HAIR_LABEL, HAIR_STYLES,
  SHIRT_COLORS, SKIN_TONES, type Accessory, type AvatarSpec, type HairStyle,
} from "../avatars";
import type {
  AppEdge, ArrowMode, EdgePatch, EdgeKind, ItemNodeData, ItemNodeType, ShapeKey, TemplateDefinition,
} from "../types";
import { Button, Field, Swatches, cx, inputClass } from "./ui";
import LaneEditor from "./LaneEditor";
import SizePanel from "./SizePanel";
import type { AnimationSpeed, ArrowAnimation } from "../flowAnimation";
import SpeedControl from "./SpeedControl";
import type { TemplateZone } from "../types";

interface InspectorProps {
  template: TemplateDefinition;
  node: ItemNodeType | undefined;
  edge: AppEdge | undefined;
  onNodeChange: (id: string, patch: Partial<ItemNodeData>) => void;
  onEdgeChange: (id: string, patch: EdgePatch) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  /** Lane/column editor, for templates with editable zones. */
  zoneEditor?: { zones: TemplateZone[]; counts: Record<string, number>; onChange: (zones: TemplateZone[]) => void };
  /** Column/lane size controls, for templates with zones. */
  sizeEditor?: { rows: boolean; length: number; onLength: (v: number) => void; onFit: () => void; onReset: () => void };
  speed: AnimationSpeed;
  onSpeedChange: (speed: AnimationSpeed) => void;
  /** Stacking order of the selected shapes. */
  onArrange: (mode: ArrangeMode) => void;
}

export type ArrangeMode = "front" | "forward" | "backward" | "back";

/** Both sides top/bottom, or both left/right: the elbow then has a movable middle segment. */
const sameAxis = (a?: string | null, b?: string | null) => {
  const vertical = (h?: string | null) => h === "t" || h === "b";
  return vertical(a ?? "b") === vertical(b ?? "t");
};

/** Connection sides (handle ids on every shape). */
const SIDES: [string, string][] = [["t", "Top"], ["r", "Right"], ["b", "Bottom"], ["l", "Left"]];

const KIND_LABEL: Record<EdgeKind, string> = { straight: "Straight", elbow: "Elbow", curved: "Curved" };
const ARROW_LABEL: Record<ArrowMode, string> = { end: "At the end", both: "Both ends", none: "None" };

const toSwatches = (colors: readonly string[], name: string) =>
  colors.map((value, i) => ({ value, name: `${name} ${i + 1}` }));

function Panel({ accent, children }: { accent?: string; children: ReactNode }) {
  return (
    <aside
      style={{ "--zone": accent } as CSSProperties}
      className="flex w-[300px] shrink-0 flex-col gap-3.5 overflow-y-auto border-t-[6px] border-l border-line border-t-[var(--zone,var(--color-line))] bg-paper p-[18px] max-md:max-h-[40vh] max-md:w-full max-md:border-l-0"
    >
      {children}
    </aside>
  );
}

function Kind({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[15px] font-extrabold text-[var(--zone,var(--color-ink))]">{children}</p>;
}

export default function Inspector(props: InspectorProps) {
  const { template, node, edge } = props;

  if (node) return <NodeInspector {...props} node={node} />;

  if (edge) {
    const d = edge.data;
    return (
      <Panel>
        <Kind>Arrow</Kind>
        <Field label="Label">
          <input
            className={inputClass}
            value={typeof edge.label === "string" ? edge.label : ""}
            placeholder="e.g. Yes, No, Approved"
            onChange={(e) => props.onEdgeChange(edge.id, { label: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="Line">
          <select className={inputClass} value={d?.kind ?? "elbow"} onChange={(e) => props.onEdgeChange(edge.id, { kind: e.target.value as EdgeKind })}>
            {(Object.keys(KIND_LABEL) as EdgeKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Leaves from">
            <select className={inputClass} value={edge.sourceHandle ?? "b"} onChange={(e) => props.onEdgeChange(edge.id, { sourceHandle: e.target.value })}>
              {SIDES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Enters at">
            <select className={inputClass} value={edge.targetHandle ?? "t"} onChange={(e) => props.onEdgeChange(edge.id, { targetHandle: e.target.value })}>
              {SIDES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>
        {(d?.kind ?? "elbow") === "elbow" && (
          <p className="-mt-1 m-0 flex items-center justify-between gap-2 text-[12.5px] text-ink-2">
            <span>
              {sameAxis(edge.sourceHandle, edge.targetHandle)
                ? "Drag the yellow handle on the arrow to move its bend."
                : "One corner only. For a movable bend, pick two sides that face the same way (e.g. Right → Left)."}
            </span>
            {d?.bend && (
              <button type="button" className="cursor-pointer font-semibold text-ink underline" onClick={() => props.onEdgeChange(edge.id, { bend: undefined })}>
                Reset
              </button>
            )}
          </p>
        )}
        <Field label="Arrowheads">
          <select className={inputClass} value={d?.arrow ?? "end"} onChange={(e) => props.onEdgeChange(edge.id, { arrow: e.target.value as ArrowMode })}>
            {(Object.keys(ARROW_LABEL) as ArrowMode[]).map((k) => <option key={k} value={k}>{ARROW_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Animation">
          <select
            className={inputClass}
            value={d?.animation ?? "none"}
            onChange={(e) => props.onEdgeChange(edge.id, { animation: e.target.value as ArrowAnimation })}
          >
            <option value="none">None</option>
            <option value="dashes">Flowing dashes</option>
            <option value="dots">Moving dots</option>
          </select>
        </Field>
        {(d?.animation ?? "none") !== "none" && (
          <Field as="div" label="Speed (all animated arrows)">
            <SpeedControl value={props.speed} onChange={props.onSpeedChange} label="Animation speed for this diagram" />
          </Field>
        )}
        <Field as="div" label="Color">
          <ColorPicker
            label="Arrow color"
            value={d?.color}
            onChange={(color) => props.onEdgeChange(edge.id, { color })}
            groups={[{ options: ARROW_COLORS }]}
            reset={{ label: "Default", value: undefined, title: "Default grey", icon: <RotateCcw className="size-3.5" aria-hidden="true" /> }}
          />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-[13.5px]">
          <input type="checkbox" className="size-4 accent-ink" checked={d?.dashed ?? false} onChange={(e) => props.onEdgeChange(edge.id, { dashed: e.target.checked })} />
          <span>Dashed line</span>
        </label>
        <Button variant="danger" className="mt-auto" onClick={() => props.onDeleteEdge(edge.id)}>Delete arrow</Button>
      </Panel>
    );
  }

  return (
    <Panel>
      <h2 className="m-0 text-[22px] font-extrabold">{template.name}</h2>
      {template.description && <p className="m-0 text-sm">{template.description}</p>}
      <p className="m-0 text-sm text-ink-2">
        Drag shapes, personas or icons from the toolbox, or click one to add it. Double-click to edit text.
        Select something to change its details here.
      </p>
      {props.sizeEditor && (
        <>
          <hr className="my-1 border-line" />
          <SizePanel {...props.sizeEditor} />
        </>
      )}
      {props.zoneEditor && (
        <>
          <hr className="my-1 border-line" />
          <LaneEditor noun={template.zoneNoun ?? "column"} {...props.zoneEditor} />
        </>
      )}
    </Panel>
  );
}

function NodeInspector(props: InspectorProps & { node: ItemNodeType }) {
  const { template, node, onNodeChange, onDeleteNode } = props;
  const zone = template.zones.find((z) => z.id === node.parentId);
  const { shape } = node.data;
  const isIcon = shape === "icon";
  const isAvatar = shape === "avatar";
  const isPersona = shape === "persona";
  const kindLabel = isIcon ? ICONS[node.data.icon ?? DEFAULT_ICON].label : SHAPES[shape].label;
  const currentFill = node.data.fill ?? SHAPES[shape].defaultFill ?? "#FFFFFF";

  const setField = (key: string, value: string) =>
    onNodeChange(node.id, { fields: { ...node.data.fields, [key]: value } });
  const textField = (key: string, label: string, placeholder?: string, rows?: number) => (
    <Field label={label} key={key}>
      {rows ? (
        <textarea className={inputClass} rows={rows} value={node.data.fields[key] ?? ""} placeholder={placeholder} onChange={(e) => setField(key, e.target.value)} />
      ) : (
        <input className={inputClass} value={node.data.fields[key] ?? ""} placeholder={placeholder} onChange={(e) => setField(key, e.target.value)} />
      )}
    </Field>
  );

  return (
    <Panel accent={zone?.color}>
      <Kind>{zone ? `${kindLabel} in ${zone.label}` : kindLabel}</Kind>

      <Field label={isPersona ? "Name" : "Label"}>
        <textarea
          className={inputClass}
          rows={isPersona ? 1 : 2}
          value={node.data.label}
          onChange={(e) => onNodeChange(node.id, { label: e.target.value })}
        />
      </Field>

      {isPersona && (
        <>
          {textField("role", "Role", "e.g. Branch manager")}
          {textField("quote", "Quote", "Something they would say")}
          {textField("goals", "Goals", "What do they want to achieve?", 3)}
          {textField("pains", "Pain points", "What slows them down?", 3)}
        </>
      )}

      {(isAvatar || isPersona) && (
        <AvatarEditor spec={node.data.avatar ?? DEFAULT_AVATAR} onChange={(avatar) => onNodeChange(node.id, { avatar })} />
      )}

      {isIcon && (
        <Field label="Icon">
          <select className={inputClass} value={node.data.icon ?? DEFAULT_ICON} onChange={(e) => onNodeChange(node.id, { icon: e.target.value as IconKey })}>
            {ICON_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {ICON_KEYS.filter((k) => ICONS[k].group === g).map((k) => <option key={k} value={k}>{ICONS[k].label}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
      )}

      {!isIcon && !isAvatar && !isPersona && (
        <Field label="Shape">
          <select className={inputClass} value={shape} onChange={(e) => onNodeChange(node.id, { shape: e.target.value as ShapeKey })}>
            {groupByCategory(paletteOf(template).includes(shape) ? paletteOf(template) : [shape, ...paletteOf(template)]).map((g) => (
              <optgroup key={g.category} label={g.category}>
                {g.keys.map((k) => <option key={k} value={k}>{SHAPES[k].label}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
      )}

      {isIcon && (
        <Field as="div" label="Icon color">
          <ColorPicker
            label="Icon color"
            value={node.data.color}
            onChange={(color) => onNodeChange(node.id, { color })}
            groups={[{ options: ARROW_COLORS }]}
            reset={{ label: "Default", value: undefined, title: zone ? `${zone.label} color` : "Default ink", icon: <RotateCcw className="size-3.5" aria-hidden="true" /> }}
          />
        </Field>
      )}
      {!isAvatar && !isIcon && (
        <Field as="div" label={isPersona ? "Card color" : "Fill"}>
          <ColorPicker
            label="Fill"
            value={currentFill}
            onChange={(fill) => onNodeChange(node.id, { fill: fill ?? NO_FILL })}
            groups={[
              { title: "Soft", options: SOFT_FILLS },
              { title: "Strong", note: "text color adjusts automatically", options: STRONG_FILLS },
            ]}
            reset={{ label: "No fill", value: NO_FILL, title: "No fill (transparent)", icon: <Ban className="size-4" aria-hidden="true" /> }}
          />
        </Field>
      )}

      <OpacityField value={node.data.opacity ?? 1} onChange={(opacity) => onNodeChange(node.id, { opacity })} />
      <ArrangeField onArrange={props.onArrange} />

      {!isPersona && template.shapes.item.fields.map((f) =>
        textField(f.key, f.label, undefined, f.type === "textarea" ? 4 : undefined))}

      <Button variant="danger" className="mt-auto" onClick={() => onDeleteNode(node.id)}>
        Delete {isPersona ? "persona" : isAvatar ? "avatar" : "shape"}
      </Button>
    </Panel>
  );
}

function AvatarEditor({ spec, onChange }: { spec: AvatarSpec; onChange: (next: AvatarSpec) => void }) {
  const set = (patch: Partial<AvatarSpec>) => onChange({ ...spec, ...patch });
  const pickIndex = (current: number, len: number) => (_: string, i: number) => ((current % len) + len) % len === i;

  return (
    <fieldset className="flex flex-col gap-3 rounded border border-line p-3">
      <legend className="px-1 text-[13px] font-bold">Appearance</legend>
      <div className={cx("mx-auto size-[72px]")}><Avatar spec={spec} /></div>
      <Field as="div" label="Skin">
        <Swatches size="sm" label="Skin" colors={toSwatches(SKIN_TONES, "Skin tone")} selected={pickIndex(spec.skin, SKIN_TONES.length)} onPick={(_, skin) => set({ skin })} />
      </Field>
      <Field label="Hair">
        <select className={inputClass} value={spec.hair} onChange={(e) => set({ hair: e.target.value as HairStyle })}>
          {HAIR_STYLES.map((h) => <option key={h} value={h}>{HAIR_LABEL[h]}</option>)}
        </select>
      </Field>
      <Field as="div" label="Hair color">
        <Swatches size="sm" label="Hair color" colors={toSwatches(HAIR_COLORS, "Hair color")} selected={pickIndex(spec.hairColor, HAIR_COLORS.length)} onPick={(_, hairColor) => set({ hairColor })} />
      </Field>
      <Field as="div" label="Clothes">
        <Swatches size="sm" label="Clothes" colors={toSwatches(SHIRT_COLORS, "Clothes color")} selected={pickIndex(spec.shirt, SHIRT_COLORS.length)} onPick={(_, shirt) => set({ shirt })} />
      </Field>
      <Field label="Accessory">
        <select className={inputClass} value={spec.accessory} onChange={(e) => set({ accessory: e.target.value as Accessory })}>
          {ACCESSORIES.map((a) => <option key={a} value={a}>{ACCESSORY_LABEL[a]}</option>)}
        </select>
      </Field>
      <Field as="div" label="Background">
        <Swatches size="sm" label="Avatar background" colors={toSwatches(AVATAR_BGS, "Background")} selected={pickIndex(spec.bg, AVATAR_BGS.length)} onPick={(_, bg) => set({ bg })} />
      </Field>
    </fieldset>
  );
}

function OpacityField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const pct = Math.round(value * 100);
  return (
    <Field label={`Opacity: ${pct}%`}>
      <input
        type="range"
        min={10}
        max={100}
        step={5}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full accent-ink"
        aria-label="Opacity"
        aria-valuetext={`${pct}%`}
      />
    </Field>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl+";

function ArrangeField({ onArrange }: { onArrange: (mode: ArrangeMode) => void }) {
  const buttons: { mode: ArrangeMode; label: string; keys: string; Icon: typeof BringToFront }[] = [
    { mode: "front", label: "Bring to front", keys: `${mod}Shift+]`, Icon: BringToFront },
    { mode: "forward", label: "Bring forward", keys: `${mod}]`, Icon: ArrowUpToLine },
    { mode: "backward", label: "Send backward", keys: `${mod}[`, Icon: ArrowDownToLine },
    { mode: "back", label: "Send to back", keys: `${mod}Shift+[`, Icon: SendToBack },
  ];
  return (
    <Field as="div" label="Arrange">
      <div className="grid grid-cols-4 overflow-hidden rounded border border-line" role="group" aria-label="Arrange">
        {buttons.map(({ mode, label, keys, Icon }) => (
          <button
            key={mode}
            type="button"
            onClick={() => onArrange(mode)}
            title={`${label} (${keys})`}
            aria-label={label}
            className="grid cursor-pointer place-items-center border-r border-line bg-field py-1.5 text-ink last:border-r-0 hover:bg-canvas"
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        ))}
      </div>
    </Field>
  );
}
