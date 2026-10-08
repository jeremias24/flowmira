import { useEffect, useState } from "react";
import { Maximize2, RotateCcw } from "lucide-react";
import { Button, inputClass } from "./ui";

interface SizePanelProps {
  rows: boolean;
  /** Column height (columns) or lane length (rows), in px. */
  length: number;
  onLength: (value: number) => void;
  onFit: () => void;
  onReset: () => void;
}

/** Column/lane size controls, shown when nothing is selected. */
export default function SizePanel({ rows, length, onLength, onFit, onReset }: SizePanelProps) {
  const [draft, setDraft] = useState(String(length));
  useEffect(() => { setDraft(String(length)); }, [length]);
  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n > 0) onLength(n);
    else setDraft(String(length));
  };
  const label = rows ? "Lane length" : "Column height";

  return (
    <section aria-label="Size" className="flex flex-col gap-2">
      <h3 className="m-0 text-[15px] font-extrabold">Size</h3>
      <p className="m-0 text-[12.5px] text-ink-2">
        Drag the right or bottom edge of any {rows ? "lane" : "column"} to resize it.
        {rows ? " Each lane's height is separate; length is shared." : " Each column's width is separate; height is shared."}
        {" "}Adding shapes past the end grows it automatically.
      </p>
      <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
        <span className="w-28 shrink-0">{label}</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={10}
          className={`${inputClass} py-1 text-sm`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          aria-label={`${label} in pixels`}
        />
        <span className="text-[12px] font-normal">px</span>
      </label>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={onFit} title="Shrink or grow every column/lane to fit its shapes">
          <Maximize2 className="size-3.5" aria-hidden="true" /> Fit to content
        </Button>
        <Button size="sm" variant="ghost" className="flex-1" onClick={onReset} title="Back to the template's sizes (never cutting off shapes)">
          <RotateCcw className="size-3.5" aria-hidden="true" /> Reset
        </Button>
      </div>
    </section>
  );
}
