// ── FIX ── + fishbone bones ("fish-top" / "fish-bottom")
import { memo, type CSSProperties, type PointerEvent } from "react";
import { useStore, type NodeProps } from "@xyflow/react";
import type { ZoneNodeType } from "../types";

type Edge = "right" | "bottom";

function ZoneNode({ id, data }: NodeProps<ZoneNodeType>) {
  const zoom = useStore((s) => s.transform[2]);
  const rows = data.orientation === "row";

  /** Drag an edge to resize; the editor applies limits so shapes never end up outside. */
  const startResize = (edge: Edge) => (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = edge === "right" ? data.width : data.height;
    const origin = edge === "right" ? e.clientX : e.clientY;
    const move = (ev: globalThis.PointerEvent) => {
      const delta = ((edge === "right" ? ev.clientX : ev.clientY) - origin) / zoom;
      data.onResize(id, edge, start + delta);
    };
    const end = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  };

  // ── NEW ── Fishbone bone: a diagonal line from its label to the spine; causes sit to its left.
  // No resize grips: bones size themselves to their causes.
  if (data.orientation === "fish-top" || data.orientation === "fish-bottom") {
    const top = data.orientation === "fish-top";
    const W = data.width;
    const H = data.height;
    const start = data.boneStart ?? 190;
    const band = data.headerTop ?? 44;
    return (
      <div
        className={`zone zone--fish ${top ? "zone--fish-top" : "zone--fish-bottom"}`}
        style={{ "--zone": data.color, "--bone-x": `${start}px`, "--zone-band": `${band}px` } as CSSProperties}
      >
        <svg className="zone__bone" width={W} height={H} aria-hidden="true">
          {/* the spine runs along the top row's lower edge, across the gap to the next bone or the head */}
          {top && <line className="zone__spine" x1={0} y1={H} x2={data.spineRun ?? W} y2={H} />}
          {top
            ? <line x1={start} y1={band} x2={W} y2={H} />
            : <line x1={W} y1={0} x2={start} y2={H - band} />}
        </svg>
        <header className="zone__head" title={data.hint}>
          <h3 className="zone__title">{data.label}</h3>
          <button
            type="button"
            className="zone__add no-export nodrag nopan"
            onClick={() => data.onAdd(id)}
            aria-label={`Add cause to ${data.label}`}
            title={`Add cause to ${data.label}`}
          >
            +
          </button>
        </header>
      </div>
    );
  }

  // Which edge resizes what: columns share their height, lanes share their length.
  const tip = (edge: Edge) => rows
    ? edge === "bottom" ? `Drag to change the height of ${data.label}` : "Drag to make all lanes longer or shorter"
    : edge === "right" ? `Drag to change the width of ${data.label}` : "Drag to make all columns taller or shorter";

  return (
    <div
      className={rows ? "zone zone--row" : "zone"}
      style={{ "--zone": data.color, "--zone-head": `${data.headerLeft}px` } as CSSProperties}
    >
      <header className="zone__head">
        <div>
          <h3 className="zone__title">{data.label}</h3>
          {data.hint && <p className="zone__hint">{data.hint}</p>}
        </div>
        <button
          type="button"
          className="zone__add no-export nodrag nopan"
          onClick={() => data.onAdd(id)}
          aria-label={`Add item to ${data.label}`}
          title={`Add item to ${data.label}`}
        >
          +
        </button>
      </header>
      {(["right", "bottom"] as const).map((edge) => (
        <div
          key={edge}
          className={`zone__grip zone__grip--${edge} no-export nodrag nopan`}
          onPointerDown={startResize(edge)}
          title={tip(edge)}
          role="separator"
          aria-orientation={edge === "right" ? "vertical" : "horizontal"}
          aria-label={tip(edge)}
        />
      ))}
    </div>
  );
}

export default memo(ZoneNode);
