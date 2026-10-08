// ── NEW ── Collapsible side panels for the editors (see audit-notes/ui-layout-review.md).
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { cx } from "./ui";

const NARROW = "(max-width: 767px)"; // Tailwind's max-md
const STORE = "flowmira.layout";

/** True below 768px, where the panels stack instead of folding. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

function readStore(): Record<string, boolean> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    return v && typeof v === "object" ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/**
 * An on/off setting remembered in this browser (panel open, mini-map shown).
 * On narrow screens it always starts off (the mini-map would cover most of a small canvas).
 */
export function useStoredFlag(name: string, fallback: boolean): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    if (window.matchMedia(NARROW).matches) return false;
    const stored = readStore()[name];
    return typeof stored === "boolean" ? stored : fallback;
  });
  const set = useCallback(
    (next: boolean) => {
      setOn(next);
      try {
        localStorage.setItem(STORE, JSON.stringify({ ...readStore(), [name]: next }));
      } catch {
        // private window or storage blocked: the setting just isn't remembered
      }
    },
    [name],
  );
  return [on, set];
}

/** A square icon button on a folded panel's rail. */
export function RailButton({
  title,
  onClick,
  pressed,
  children,
}: {
  title: string;
  onClick: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      className={cx(
        "grid size-9 cursor-pointer place-items-center rounded",
        pressed ? "bg-mark text-[#16222e]" : "text-ink-2 hover:bg-canvas hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/**
 * A side panel that folds to a 44px rail (desktop). Below 768px it does nothing: the panels
 * stack above and below the canvas as before (owner: stacking is intended on narrow screens).
 */
export default function SideDock({
  side,
  label,
  open,
  onOpenChange,
  rail,
  children,
}: {
  side: "left" | "right";
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Extra rail buttons shown while folded (e.g. jump straight to a toolbox tab). */
  rail?: ReactNode;
  children: ReactNode;
}) {
  const narrow = useNarrow();
  const left = side === "left";
  const key = left ? "[" : "]";
  const edge = left ? "border-r border-line" : "border-l border-line";

  if (narrow) return <>{children}</>;

  if (!open) {
    const Open = left ? PanelLeftOpen : PanelRightOpen;
    return (
      <nav aria-label={label} className={cx("flex w-11 shrink-0 flex-col items-center gap-1 bg-paper py-2", edge)}>
        <RailButton title={`Show ${label.toLowerCase()} (${key})`} onClick={() => onOpenChange(true)}>
          <Open className="size-[18px]" aria-hidden="true" />
        </RailButton>
        {rail && (
          <>
            <hr className="my-1 w-6 border-line" />
            {rail}
          </>
        )}
      </nav>
    );
  }

  const Close = left ? PanelLeftClose : PanelRightClose;
  return (
    <>
      <div className={cx("flex min-h-0 shrink-0 flex-col bg-paper", edge)}>
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-line pr-1.5 pl-3">
          <span className="text-[12px] font-bold tracking-wide text-ink-2 uppercase">{label}</span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            title={`Hide ${label.toLowerCase()} (${key})`}
            aria-label={`Hide ${label.toLowerCase()}`}
            className="grid size-7 cursor-pointer place-items-center rounded text-ink-2 hover:bg-canvas hover:text-ink"
          >
            <Close className="size-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
