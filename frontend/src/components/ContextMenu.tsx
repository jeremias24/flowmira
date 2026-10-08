import { useEffect, useRef } from "react";
import { BringToFront, ClipboardPaste, Copy, CopyPlus, MousePointerSquareDashed, Scissors, SendToBack, Trash2 } from "lucide-react";

export interface MenuState {
  /** Position inside the canvas, px. */
  x: number;
  y: number;
  /** What was right-clicked. */
  kind: "selection" | "edge" | "pane";
}

interface Actions {
  cut: () => void;
  copy: () => void;
  paste: () => void;
  duplicate: () => void;
  delete: () => void;
  selectAll: () => void;
  front: () => void;
  back: () => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const key = (k: string) => (isMac ? `⌘${k}` : `Ctrl+${k}`);

export default function ContextMenu({
  menu, canPaste, onClose, actions,
}: { menu: MenuState; canPaste: boolean; onClose: () => void; actions: Actions }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [onClose]);

  const items = [
    ...(menu.kind === "selection" ? [
      { label: "Cut", shortcut: key("X"), Icon: Scissors, run: actions.cut },
      { label: "Copy", shortcut: key("C"), Icon: Copy, run: actions.copy },
      { label: "Duplicate", shortcut: key("D"), Icon: CopyPlus, run: actions.duplicate },
      { label: "Bring to front", shortcut: key("Shift+]"), Icon: BringToFront, run: actions.front },
      { label: "Send to back", shortcut: key("Shift+["), Icon: SendToBack, run: actions.back },
    ] : []),
    ...(menu.kind !== "edge" ? [
      { label: "Paste", shortcut: key("V"), Icon: ClipboardPaste, run: actions.paste, disabled: !canPaste },
      { label: "Select all", shortcut: key("A"), Icon: MousePointerSquareDashed, run: actions.selectAll },
    ] : []),
    ...(menu.kind !== "pane" ? [
      { label: "Delete", shortcut: "Del", Icon: Trash2, run: actions.delete, danger: true },
    ] : []),
  ];

  return (
    <div
      ref={root}
      role="menu"
      aria-label="Edit"
      style={{ left: menu.x, top: menu.y }}
      className="absolute z-30 min-w-52 overflow-hidden rounded-md border border-line bg-paper py-1 shadow-xl"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map(({ label, shortcut, Icon, run, disabled, danger }) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          disabled={disabled}
          onClick={() => { onClose(); run(); }}
          className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-[13.5px] hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${danger ? "text-danger" : "text-ink"}`}
        >
          <Icon className="size-4 shrink-0 opacity-75" aria-hidden="true" />
          <span className="flex-1">{label}</span>
          <span className="text-[12px] text-ink-2">{shortcut}</span>
        </button>
      ))}
    </div>
  );
}
