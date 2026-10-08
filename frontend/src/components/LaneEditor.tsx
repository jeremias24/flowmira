import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { TemplateZone } from "../types";
import { cx, inputClass } from "./ui";

// Colours offered for new lanes, in turn.
const LANE_COLORS = ["#7A4E6B", "#2B5F9E", "#2F7D4F", "#4A5866", "#C0782B", "#1F7A80", "#3B3F8F", "#B23A2F"];

interface LaneEditorProps {
  /** "lane", "column"… used in labels. */
  noun: string;
  zones: TemplateZone[];
  /** Number of shapes in each zone, by zone id. */
  counts: Record<string, number>;
  onChange: (zones: TemplateZone[]) => void;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded text-ink-2 hover:bg-canvas hover:text-ink disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

export default function LaneEditor({ noun, zones, counts, onChange }: LaneEditorProps) {
  const update = (i: number, patch: Partial<TemplateZone>) =>
    onChange(zones.map((z, j) => (j === i ? { ...z, ...patch } : z)));
  const move = (i: number, by: number) => {
    const next = [...zones];
    const [z] = next.splice(i, 1);
    if (z) next.splice(i + by, 0, z);
    onChange(next);
  };
  const add = () => {
    const used = new Set(zones.map((z) => z.color.toUpperCase()));
    const color = LANE_COLORS.find((c) => !used.has(c)) ?? LANE_COLORS[zones.length % LANE_COLORS.length] ?? "#4A5866";
    onChange([...zones, { id: `lane-${crypto.randomUUID().slice(0, 8)}`, label: `New ${noun}`, color }]);
  };

  return (
    <section aria-label={`${cap(noun)}s`} className="flex flex-col gap-2">
      <h3 className="m-0 text-[15px] font-extrabold">{cap(noun)}s</h3>
      <p className="m-0 text-[12.5px] text-ink-2">Usually one per role, team or system. Changes are saved with this diagram.</p>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {zones.map((z, i) => {
          const count = counts[z.id] ?? 0;
          return (
            <li key={z.id} className="flex items-center gap-1">
              <label
                title={`${cap(noun)} color`}
                className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/15"
                style={{ background: z.color }}
              >
                <span className="sr-only">{`${z.label}: color`}</span>
                <input
                  type="color"
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  value={z.color}
                  onChange={(e) => update(i, { color: e.target.value.toUpperCase() })}
                  aria-label={`${z.label}: color`}
                />
              </label>
              <input
                className={cx(inputClass, "min-w-0 flex-1 py-1 text-sm")}
                value={z.label}
                onChange={(e) => update(i, { label: e.target.value })}
                aria-label={`${cap(noun)} ${i + 1} name`}
              />
              <IconButton label={`Move ${z.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="size-4" aria-hidden="true" />
              </IconButton>
              <IconButton label={`Move ${z.label} down`} disabled={i === zones.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="size-4" aria-hidden="true" />
              </IconButton>
              <IconButton
                label={count > 0 ? `${z.label} has ${count} shape${count > 1 ? "s" : ""}: move or delete them first` : `Remove ${z.label}`}
                disabled={count > 0 || zones.length <= 1}
                onClick={() => onChange(zones.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </IconButton>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={add}
        className="flex cursor-pointer items-center justify-center gap-1.5 rounded border border-dashed border-line py-1.5 text-[13.5px] font-semibold text-ink hover:border-ink-2 hover:bg-canvas"
      >
        <Plus className="size-4" aria-hidden="true" /> Add {noun}
      </button>
    </section>
  );
}
