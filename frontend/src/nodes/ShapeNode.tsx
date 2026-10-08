import { memo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Handle, NodeResizer, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { SHAPES } from "../shapes";
import { NO_FILL, needsLightText } from "../colors";
import { DEFAULT_ICON, ICONS } from "../icons";
import { Avatar, DEFAULT_AVATAR } from "../avatars";
import type { ItemNodeType } from "../types";

const HANDLES = [
  { id: "t", pos: Position.Top },
  { id: "r", pos: Position.Right },
  { id: "b", pos: Position.Bottom },
  { id: "l", pos: Position.Left },
] as const;

function ShapeNode({ id, data, selected }: NodeProps<ItemNodeType>) {
  const def = SHAPES[data.shape] ?? SHAPES.process;
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);

  const startEdit = () => { setDraft(data.label); setEditing(true); };
  const commit = () => { setEditing(false); if (draft !== data.label) updateNodeData(id, { label: draft }); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") { setEditing(false); }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commit();
  };

  const fill = data.fill ?? def.defaultFill ?? "#FFFFFF";
  // On dark fills, switch every text colour on the shape to white so it stays readable.
  const light = needsLightText(fill);
  // "-doc" = document colours. styles.css maps them to --stroke/--text, and swaps them for
  // light ones in dark mode where a shape has nothing behind it but the canvas.
  const style = {
    "--stroke-doc": data.zoneColor ?? "var(--dg-ink)",
    "--fill": fill,
    ...(light ? { "--text-doc": "#FFFFFF", "--text-2": "rgba(255,255,255,.82)", "--text-accent": "#FFFFFF" } : {}),
    // Icons: their own colour (no background tile).
    ...(data.shape === "icon" && data.color ? { "--icon-color": data.color } : {}),
    opacity: data.opacity ?? 1,
  } as CSSProperties;
  // Not inside a column: sits on the canvas itself.
  const onCanvas = !data.zoneColor;
  // ...and draws no background of its own, so its text/outline touch the canvas directly.
  const bare = onCanvas && (fill === NO_FILL || data.shape === "text" || data.shape === "icon");
  const canvasClass = `${onCanvas ? " on-canvas" : ""}${bare ? " bare" : ""}`;

  // Template-chosen fields shown under the title on cards (e.g. owner, tool, CTQ).
  const cardMeta = (data.cardFields ?? [])
    .map((f) => ({ ...f, value: data.fields[f.key]?.trim() }))
    .filter((f) => f.value);

  const editor = (
    <textarea
      className="shape__editor nodrag nowheel"
      value={draft}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      aria-label="Label"
    />
  );
  const handles = data.connectable &&
    HANDLES.map((h) => <Handle key={h.id} id={h.id} type="source" position={h.pos} />);
  const resizer = (
    <NodeResizer
      isVisible={selected && !editing}
      minWidth={40}
      minHeight={28}
      lineClassName="no-export"
      handleClassName="no-export"
    />
  );

  if (def.glyph && def.path) {
    // BPMN event/gateway: proportional symbol, caption underneath. Connection dots sit on
    // the symbol (not the caption): see .shape--glyph handle rules in styles.css.
    return (
      <div className={`shape shape--glyph shape--${data.shape}${canvasClass}`} style={style} onDoubleClick={startEdit}>
        {resizer}
        <svg className="shape__symbol" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" overflow="visible" aria-hidden="true">
          <path className="shape__outline" d={def.path} vectorEffect="non-scaling-stroke" />
          {def.detail && <path className="shape__detail" d={def.detail} vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="shape__caption">
          {editing ? editor : data.label && <span className="shape__label">{data.label}</span>}
        </div>
        {handles}
      </div>
    );
  }

  if (data.shape === "avatar") {
    return (
      <div className={`shape shape--avatar${canvasClass}`} style={style} onDoubleClick={startEdit}>
        {resizer}
        <div className="shape__glyph">
          <Avatar spec={data.avatar ?? DEFAULT_AVATAR} title={data.label || "Persona"} />
        </div>
        <div className="shape__caption">
          {editing ? editor : data.label && <span className="shape__label">{data.label}</span>}
        </div>
        {handles}
      </div>
    );
  }

  if (data.shape === "persona") {
    const f = data.fields;
    return (
      <div className={`shape shape--persona${canvasClass}`} style={style} onDoubleClick={startEdit}>
        {resizer}
        <div className="persona__head">
          <div className="persona__avatar"><Avatar spec={data.avatar ?? DEFAULT_AVATAR} /></div>
          <div className="persona__who">
            {editing ? editor : <span className="persona__name">{data.label || "Name"}</span>}
            {f.role && <span className="persona__role">{f.role}</span>}
            {f.quote && <span className="persona__quote">“{f.quote}”</span>}
          </div>
        </div>
        <div className="persona__body">
          <section className="persona__sec">
            <h4>Goals</h4>
            <p>{f.goals || "What do they want to achieve?"}</p>
          </section>
          <section className="persona__sec">
            <h4>Pain points</h4>
            <p>{f.pains || "What slows them down or frustrates them?"}</p>
          </section>
        </div>
        {handles}
      </div>
    );
  }

  if (data.shape === "icon") {
    const { Icon, label } = ICONS[data.icon ?? DEFAULT_ICON];
    return (
      <div className={`shape shape--icon${canvasClass}`} style={style} onDoubleClick={startEdit}>
        {resizer}
        <div className="shape__glyph">
          <Icon strokeWidth={1.6} aria-label={label} />
        </div>
        <div className="shape__caption">
          {editing ? editor : data.label && <span className="shape__label">{data.label}</span>}
        </div>
        {handles}
      </div>
    );
  }

  return (
    <div className={`shape shape--${data.shape}${canvasClass}`} style={style} onDoubleClick={startEdit}>
      {resizer}
      {def.path && (
        <svg className="shape__svg" viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible" aria-hidden="true">
          <path className="shape__outline" d={def.path} vectorEffect="non-scaling-stroke" />
          {def.detail && <path className="shape__detail" d={def.detail} vectorEffect="non-scaling-stroke" />}
        </svg>
      )}
      <div className="shape__text" style={{ padding: def.inset }}>
        {editing ? editor : (
          <>
            <span className="shape__label">{data.label}</span>
            {data.shape === "card" && cardMeta.length > 0 && (
              <span className="shape__meta">
                {cardMeta.map((f, i) => (
                  <span key={f.key} className={i > 0 ? "shape__ctq" : undefined}>
                    {f.prefix ? `${f.prefix}: ${f.value}` : f.value}
                  </span>
                ))}
              </span>
            )}
          </>
        )}
      </div>
      {handles}
    </div>
  );
}

export default memo(ShapeNode);
