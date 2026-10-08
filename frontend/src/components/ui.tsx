// Small shared UI building blocks, styled with Tailwind.
// Colours come from the theme tokens in styles.css (@theme): ink, ink-2, canvas, paper, line, mark, danger.
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

type Variant = "primary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary: "bg-ink border-ink text-on-ink hover:opacity-90 disabled:opacity-60",
  outline: "bg-paper border-line text-ink hover:border-ink-2",
  ghost: "bg-transparent border-line text-ink hover:border-ink-2",
  danger: "bg-transparent border-danger/40 text-danger hover:bg-danger-soft hover:border-danger",
};
const SIZE: Record<Size, string> = {
  sm: "px-2.5 py-1 text-[13px]",
  md: "px-3.5 py-[7px]",
};

export function Button({
  variant = "outline", size = "md", className, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded border font-semibold cursor-pointer transition-colors disabled:cursor-default",
        VARIANT[variant], SIZE[size], className,
      )}
      {...props}
    />
  );
}

/** Shared look for input, textarea and select. */
export const inputClass =
  "w-full rounded border border-line bg-field text-ink px-2.5 py-[7px] text-[15px] focus:border-ink focus:outline-2 focus:outline-mark";

export function Field({ label, children, as = "label" }: { label: string; children: ReactNode; as?: "label" | "div" }) {
  const Tag = as;
  return (
    <Tag className="flex flex-col gap-1">
      <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      {children}
    </Tag>
  );
}

export function Swatches({
  label, colors, selected, onPick, size = "md",
}: {
  label: string;
  colors: readonly { value: string; name: string }[];
  selected: (value: string, index: number) => boolean;
  onPick: (value: string, index: number) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {colors.map((c, i) => {
        const on = selected(c.value, i);
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${label}: ${c.name}`}
            title={c.name}
            onClick={() => onPick(c.value, i)}
            style={{ background: c.value }}
            className={cx(
              "rounded-full border border-line cursor-pointer p-0",
              size === "sm" ? "size-[22px]" : "size-[26px]",
              on && "shadow-[0_0_0_2px_var(--color-paper),0_0_0_4px_var(--color-ink)]",
            )}
          />
        );
      })}
    </div>
  );
}

export function Segmented({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="mb-2 grid auto-cols-fr grid-flow-col overflow-hidden rounded border border-line">
      {children}
    </div>
  );
}

export function SegButton({
  pressed, onClick, title, children,
}: { pressed: boolean; onClick: () => void; title?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
      className={cx(
        "grid place-items-center border-r border-line py-1.5 text-[13px] font-semibold cursor-pointer last:border-r-0",
        pressed ? "bg-ink text-on-ink" : "bg-field text-ink hover:bg-canvas",
      )}
    >
      {children}
    </button>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 text-sm font-extrabold">{children}</h2>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="mb-2.5 text-[12.5px] leading-snug text-ink-2">{children}</p>;
}
