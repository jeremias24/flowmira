import { useEffect, useState, type ReactNode } from "react";
import { normalizeHex, sameColor, type ColorOption } from "../colors";
import { cx, inputClass } from "./ui";

export interface ColorGroup {
  title?: string;
  note?: string;
  options: ColorOption[];
}

interface ColorPickerProps {
  label: string;
  /** Current colour; may be a special value (see `reset`). */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  groups: ColorGroup[];
  /** A non-colour choice shown as a button, e.g. "No fill" or "Default". */
  reset?: { label: string; value: string | undefined; icon: ReactNode; title: string };
  /** Small swatches, no hex box (for the toolbox). */
  compact?: boolean;
}

function Swatch({ option, on, onPick, small }: { option: ColorOption; on: boolean; onPick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={option.name}
      title={option.name}
      onClick={onPick}
      style={{ background: option.value }}
      className={cx(
        "cursor-pointer rounded-full border border-black/15 p-0",
        small ? "size-5" : "size-6",
        on && "shadow-[0_0_0_2px_var(--color-paper),0_0_0_4px_var(--color-ink)]",
      )}
    />
  );
}

export default function ColorPicker({ label, value, onChange, groups, reset, compact = false }: ColorPickerProps) {
  const isReset = reset !== undefined && value === reset.value;
  const hexValue = isReset ? undefined : normalizeHex(value ?? "") ?? undefined;
  const isPreset = groups.some((g) => g.options.some((o) => sameColor(o.value, value)));
  const isCustom = !isReset && !isPreset && hexValue !== undefined;
  const [hex, setHex] = useState(hexValue ?? "");

  // Keep the hex box in sync when a swatch is picked or another item is selected.
  useEffect(() => { setHex(hexValue ?? ""); }, [hexValue]);

  const commitHex = (raw: string) => {
    const n = normalizeHex(raw);
    if (n) onChange(n);
  };

  const custom = (
    <label
      title="Pick any colour"
      className={cx(
        "relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded border",
        compact ? "size-5 rounded-full" : "size-[34px]",
        isCustom ? "border-ink shadow-[0_0_0_1px_var(--color-ink)]" : "border-line",
      )}
      style={{ background: "conic-gradient(#e44, #fc3, #4c6, #3bd, #46e, #c4c, #e44)" }}
    >
      <span className="sr-only">Custom colour</span>
      <input
        type="color"
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        value={hexValue ?? "#4A5866"}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        aria-label={`${label}: custom colour`}
      />
      {isCustom && !compact && <span className="size-3.5 rounded-full border-2 border-white" style={{ background: hexValue }} />}
    </label>
  );

  const resetButton = reset && (
    <button
      type="button"
      role="radio"
      aria-checked={isReset}
      onClick={() => onChange(reset.value)}
      title={reset.title}
      className={cx(
        "flex shrink-0 cursor-pointer items-center gap-1.5 rounded border font-semibold",
        compact ? "px-1.5 py-0.5 text-[12px]" : "px-2 py-[5px] text-[13px]",
        isReset ? "border-ink bg-ink text-on-ink" : "border-line bg-field text-ink hover:border-ink-2",
      )}
    >
      {reset.icon} {reset.label}
    </button>
  );

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
        {resetButton}
        {groups.flatMap((g) => g.options).map((o) => (
          <Swatch key={o.value} small option={o} on={sameColor(o.value, value)} onPick={() => onChange(o.value)} />
        ))}
        {custom}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label={label}>
      {groups.map((g, i) => (
        <div key={g.title ?? i} className="flex flex-col gap-2">
          {g.title && (
            <span className="text-[11.5px] font-semibold text-ink-2">
              {g.title} {g.note && <span className="font-normal">({g.note})</span>}
            </span>
          )}
          <div className="flex flex-wrap gap-1.5">
            {g.options.map((o) => (
              <Swatch key={o.value} option={o} on={sameColor(o.value, value)} onPick={() => onChange(o.value)} />
            ))}
          </div>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-2">
        {resetButton}
        {custom}
        <input
          className={cx(inputClass, "min-w-0 flex-1 py-[5px] font-mono text-[13px] uppercase")}
          value={hex}
          placeholder={isReset ? reset?.label : "#RRGGBB"}
          maxLength={7}
          spellCheck={false}
          aria-label={`${label}: hex colour`}
          onChange={(e) => {
            setHex(e.target.value);
            // Apply as soon as a full 6-digit colour is typed; short forms (#abc) apply on Enter/blur.
            if (e.target.value.replace("#", "").length === 6) commitHex(e.target.value);
          }}
          onBlur={() => { commitHex(hex); setHex(hexValue ?? ""); }}
          onKeyDown={(e) => { if (e.key === "Enter") commitHex(hex); }}
        />
      </div>
    </div>
  );
}
