import { memo, useEffect, useState, type CSSProperties, type KeyboardEvent } from "react"; // ── FIX ── + useEffect
import { Handle, NodeResizer, useReactFlow, useStore, useUpdateNodeInternals, type NodeProps } from "@xyflow/react"; // ── FIX ── - Position, + useStore, useUpdateNodeInternals
import { ImageOff } from "lucide-react"; // ── NEW ──
import { SHAPES } from "../shapes";
import { NO_FILL, needsLightText } from "../colors";
import { DEFAULT_ICON, ICONS } from "../icons";
import { Avatar, DEFAULT_AVATAR } from "../avatars";
import { alignItems, fontCss } from "../fonts"; // ── NEW ──
import { ANCHORS, anchorStyle, captionHeight } from "../anchors"; // ── NEW ──
import { isDfdShape } from "../dfd"; // ── NEW ──
import type { ItemNodeType } from "../types";

function ShapeNode({ id, data, selected }: NodeProps<ItemNodeType>) {
  const def = SHAPES[data.shape] ?? SHAPES.process;
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  // ── NEW ── The extra dots are placed from the shape's size. React Flow keeps its own copy
  // of where each dot is, so it has to re-read them when they move without the box resizing.
  const width = useStore((s) => s.nodeLookup.get(id)?.measured.width) ?? def.w;
  const height = useStore((s) => s.nodeLookup.get(id)?.measured.height) ?? def.h;
  const caption = captionHeight(data.fontSize);
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => { updateNodeInternals(id); }, [id, data.shape, width, height, caption, updateNodeInternals]);

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
    "--stroke-doc": data.zoneColor ?? def.defaultStroke ?? "var(--dg-ink)", // ── FIX ── DFD shapes default to teal
    "--fill": fill,
    ...(light ? { "--text-doc": "#FFFFFF", "--text-2": "rgba(255,255,255,.82)", "--text-accent": "#FFFFFF" } : {}),
    // Icons: their own colour (no background tile).
    ...(data.shape === "icon" && data.color ? { "--icon-color": data.color } : {}),
    // ── NEW ── Text style. Each shape type has its own default size in styles.css.
    ...(data.fontFamily ? { fontFamily: fontCss(data.fontFamily) } : {}),
    ...(data.fontSize ? { "--label-size": `${data.fontSize}px` } : {}),
    // ── NEW ── Their own variables, so a chosen color also survives dark mode and exports.
    ...(data.textColor ? { "--label-color": data.textColor } : {}),
    ...(data.textAlign ? { "--label-align": data.textAlign, "--label-items": alignItems(data.textAlign) } : {}),
    opacity: data.opacity ?? 1,
  } as CSSProperties;
  // Not inside a column: sits on the canvas itself.
  const onCanvas = !data.zoneColor;
  // ...and draws no background of its own, so its text/outline touch the canvas directly.
  const bare = onCanvas && (fill === NO_FILL || data.shape === "text" || data.shape === "icon" || data.shape === "image"); // ── FIX ── + image
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
    ANCHORS.map((a) => (
      <Handle
        key={a.id}
        id={a.id}
        type="source"
        position={a.pos}
        className={a.along ? "shape-anchor" : undefined} // ── NEW ──
        style={a.along ? anchorStyle(data.shape, a, width, height, caption) : undefined} // ── NEW ──
      />
    ));
  const resizer = (
    <NodeResizer
      isVisible={selected && !editing}
      keepAspectRatio={data.shape === "image"} // ── NEW ── resizing never stretches a picture
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

  // ── NEW ── draggable={false}: dragging must move the shape, not start a browser image drag.
  if (data.shape === "image") {
    return (
      <div className={`shape shape--image${canvasClass}`} style={style} onDoubleClick={startEdit}>
        {resizer}
        <div className="shape__picture">
          {data.image ? (
            <img src={data.image} alt={data.label || "Image"} draggable={false} />
          ) : (
            <span className="shape__missing">
              <ImageOff aria-hidden="true" />
              Image missing
            </span>
          )}
        </div>
        {(editing || data.label) && (
          <div className="shape__caption">
            {editing ? editor : <span className="shape__label">{data.label}</span>}
          </div>
        )}
        {handles}
      </div>
    );
  }

  // ── NEW ── Data flow diagram shapes (Gane & Sarson).
  if (isDfdShape(data.shape)) {
    const f = data.fields;
    const ref = f.ref?.trim();
    const label = editing ? editor : <span className="shape__label">{data.label}</span>;
    if (data.shape === "dfd-store") {
      return (
        <div className={`shape shape--dfd-store${canvasClass}`} style={style} onDoubleClick={startEdit}>
          {resizer}
          <span className="dfd__id">{ref}</span>
          <div className="dfd__body">{label}</div>
          {handles}
        </div>
      );
    }
    const subtitle = f.subtitle?.trim();
    const description = f.description?.trim();
    return (
      <div className={`shape shape--${data.shape}${canvasClass}`} style={style} onDoubleClick={startEdit}>
        {resizer}
        {data.shape === "dfd-process" && ref && <span className="dfd__ref">{ref}</span>}
        <div className="dfd__body">
          {label}
          {!editing && data.shape === "dfd-process" && subtitle && <span className="dfd__subtitle">{subtitle}</span>}
          {!editing && description && <span className="dfd__desc">{description}</span>}
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
