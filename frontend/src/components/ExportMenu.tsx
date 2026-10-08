import { useEffect, useRef, useState } from "react";
import { ChevronDown, Clapperboard, FileImage, FileText, ImageOff } from "lucide-react";
import { cx } from "./ui";

export type ExportKind = "png" | "png-transparent" | "pdf" | "gif";

const ITEMS: { kind: ExportKind; label: string; hint: string; Icon: typeof FileImage }[] = [
  { kind: "png", label: "PNG", hint: "Image with a white background", Icon: FileImage },
  { kind: "png-transparent", label: "PNG, transparent", hint: "No background, for slides and documents", Icon: ImageOff },
  { kind: "pdf", label: "PDF", hint: "Fitted to an A4 page, ready to print", Icon: FileText },
  { kind: "gif", label: "GIF, animated", hint: "2-second loop of your animated arrows", Icon: Clapperboard },
];

interface ExportMenuProps {
  onExport: (kind: ExportKind) => void;
  busy: boolean;
  /** e.g. "GIF 12/30" while a long export runs. */
  progress?: string;
  /** GIF only makes sense when at least one arrow is animated. */
  canGif: boolean;
}

export default function ExportMenu({ onExport, busy, progress, canGif }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line bg-transparent px-3.5 py-[7px] font-semibold text-ink hover:border-ink-2 disabled:cursor-default disabled:opacity-60"
      >
        {busy ? (progress ? `Exporting ${progress}` : "Exporting…") : "Export"}
        <ChevronDown className={cx("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Export as"
          className="absolute right-0 z-20 mt-1.5 w-72 overflow-hidden rounded-md border border-line bg-paper py-1 shadow-xl"
        >
          {ITEMS.map(({ kind, label, hint, Icon }) => {
            const disabled = kind === "gif" && !canGif;
            return (
              <button
                key={kind}
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => { setOpen(false); onExport(kind); }}
                className="flex w-full cursor-pointer items-start gap-3 px-3.5 py-2.5 text-left hover:bg-canvas focus-visible:bg-canvas disabled:cursor-default disabled:opacity-55 disabled:hover:bg-transparent"
              >
                <Icon className="mt-0.5 size-[18px] shrink-0 text-ink-2" aria-hidden="true" />
                <span className="flex flex-col">
                  <span className="font-semibold text-ink">{label}</span>
                  <span className="text-[12.5px] text-ink-2">
                    {disabled ? "Turn on animation for an arrow first" : hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
