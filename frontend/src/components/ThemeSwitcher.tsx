import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePref } from "../theme";
import { cx } from "./ui";

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];

/** Light / System / Dark switch. Compact = icons only (editor toolbar). */
export default function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { pref, setPref } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex overflow-hidden rounded border border-line bg-field">
      {OPTIONS.map(({ value, label, Icon }) => {
        const on = pref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setPref(value)}
            className={cx(
              "flex cursor-pointer items-center gap-1.5 border-r border-line text-[13px] font-semibold last:border-r-0",
              compact ? "px-2 py-[7px]" : "px-3 py-1.5",
              on ? "bg-ink text-on-ink" : "text-ink-2 hover:bg-canvas hover:text-ink",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {!compact && label}
          </button>
        );
      })}
    </div>
  );
}
