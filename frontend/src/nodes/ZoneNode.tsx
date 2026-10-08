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
