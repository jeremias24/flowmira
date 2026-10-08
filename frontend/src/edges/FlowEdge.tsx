// The one arrow component: straight, elbow (right angles) or curved, optionally animated.
// - Elbow arrows go straight when both ends are nearly lined up (no tiny "jog").
// - Animation (flowing dashes / moving dots) is positioned by flowAnimation.applyPhase,
//   not by CSS, so GIF export can capture any moment exactly.
import { memo, type CSSProperties, type PointerEvent } from "react";
import {
  BaseEdge, EdgeLabelRenderer, Position, getBezierPath, getSmoothStepPath, getStraightPath,
  useReactFlow, useStore, type EdgeProps,
} from "@xyflow/react";
import { dotCount, useAnimationSpeed } from "../flowAnimation";
import { useHoppedPath } from "../lineHops"; // ── NEW ──
import { endMark, type EndMark } from "../crowsFoot"; // ── NEW ──
import { elbowRoute, isAligned } from "../elbow"; // ── NEW ──
import type { AppEdge } from "../types";

/** The default elbow route. Once the user moves it, elbow.ts draws it instead. */
function elbowPath(sx: number, sy: number, sp: Position, tx: number, ty: number, tp: Position): [string, number, number] {
  if (isAligned(sx, sy, sp, tx, ty, tp)) {
    return sp === Position.Top || sp === Position.Bottom
      ? [`M ${tx},${sy} L ${tx},${ty}`, tx, (sy + ty) / 2]
      : [`M ${sx},${ty} L ${tx},${ty}`, (sx + tx) / 2, ty];
  }
  const [path, lx, ly] = getSmoothStepPath({ sourceX: sx, sourceY: sy, sourcePosition: sp, targetX: tx, targetY: ty, targetPosition: tp });
  return [path, lx, ly];
}

// ── NEW ── Crow's-foot marks: which way the line leaves each end.
const SIDE_DIR: Record<Position, { x: number; y: number }> = {
  [Position.Top]: { x: 0, y: -1 },
  [Position.Bottom]: { x: 0, y: 1 },
  [Position.Left]: { x: -1, y: 0 },
  [Position.Right]: { x: 1, y: 0 },
};
function unit(dx: number, dy: number) {
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

/** A crow's-foot mark drawn at one end of the arrow, in the arrow's colour. */
function EndMarkShape({ x, y, dir, mark }: { x: number; y: number; dir: { x: number; y: number }; mark: EndMark }) {
  const m = endMark({ x, y }, dir, mark);
  return (
    <>
      <path d={m.d} className="flow-mark" />
      {m.circle && <circle cx={m.circle.x} cy={m.circle.y} r={4} className="flow-mark flow-mark--zero" />}
    </>
  );
}

function FlowEdge({
  id, data, selected, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  markerStart, markerEnd, style, label, labelStyle, labelShowBg, labelBgStyle,
  labelBgPadding, labelBgBorderRadius, interactionWidth,
}: EdgeProps<AppEdge>) {
  const kind = data?.kind ?? "elbow";
  let path: string;
  let labelX: number;
  let labelY: number;
  // ── FIX ── every elbow arrow has something to move; see elbow.ts
  const elbow = kind === "elbow"
    ? elbowRoute(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, data?.bend)
    : null;
  if (kind === "straight") {
    [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  } else if (kind === "curved") {
    [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  } else if (elbow?.path) {
    [path, labelX, labelY] = [elbow.path, elbow.handle.x, elbow.handle.y];
  } else {
    [path, labelX, labelY] = elbowPath(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition);
  }

  // ── NEW ── hop over the arrows this one crosses (see lineHops.tsx)
  const drawnPath = useHoppedPath(id, path);

  const animation = data?.animation ?? "none";
  const speed = useAnimationSpeed();
  // Approximate length, only to decide how many dots to draw; their positions use the real path.
  const dx = Math.abs(targetX - sourceX);
  const dy = Math.abs(targetY - sourceY);
  const approx = kind === "elbow" ? dx + dy : Math.hypot(dx, dy) * (kind === "curved" ? 1.15 : 1);
  const edgeColor = (style as Record<string, unknown> | undefined)?.["--edge"] as string | undefined;

  // Drag handle for the bend of a selected elbow arrow.
  const bendAxis = elbow?.axis; // ── FIX ── was worked out from the ends alone
  const { updateEdgeData } = useReactFlow();
  const zoom = useStore((st) => st.transform[2]);
  const startBendDrag = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = data?.bend ?? { x: 0, y: 0 };
    const origin = { x: e.clientX, y: e.clientY };
    const move = (ev: globalThis.PointerEvent) => {
      updateEdgeData(id, {
        bend: {
          x: bendAxis === "y" ? 0 : start.x + (ev.clientX - origin.x) / zoom, // ── FIX ── "xy" moves both
          y: bendAxis === "x" ? 0 : start.y + (ev.clientY - origin.y) / zoom,
        },
      });
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

  return (
    <>
      <BaseEdge
        id={id}
        path={drawnPath} // ── FIX ── was `path`
        labelX={labelX}
        labelY={labelY}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={style}
        label={label}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
        interactionWidth={interactionWidth}
        {...(animation !== "none" ? { "data-anim": animation } : {})}
      />
      {/* ── NEW ── crow's-foot ends. Straight lines leave along the line itself; elbow
          and curved lines leave straight out of the side they're attached to. */}
      {data?.startMark && (
        <EndMarkShape
          x={sourceX}
          y={sourceY}
          dir={kind === "straight" ? unit(targetX - sourceX, targetY - sourceY) : SIDE_DIR[sourcePosition]}
          mark={data.startMark}
        />
      )}
      {data?.endMark && (
        <EndMarkShape
          x={targetX}
          y={targetY}
          dir={kind === "straight" ? unit(sourceX - targetX, sourceY - targetY) : SIDE_DIR[targetPosition]}
          mark={data.endMark}
        />
      )}
      {animation === "dots" &&
        Array.from({ length: dotCount(approx, speed) }, (_, i) => (
          <circle
            key={i}
            className="flow-dot"
            r={4}
            cx={sourceX}
            cy={sourceY}
            style={edgeColor ? ({ "--edge": edgeColor } as CSSProperties) : undefined}
          />
        ))}
      {selected && elbow && (
        <EdgeLabelRenderer>
          <div
            className={`edge-bend edge-bend--${bendAxis} nodrag nopan no-export`}
            style={{ transform: `translate(-50%, -50%) translate(${elbow.handle.x}px, ${elbow.handle.y}px)` }} // ── FIX ── was the label's position
            onPointerDown={startBendDrag}
            onDoubleClick={() => updateEdgeData(id, { bend: undefined })}
            title={`Drag ${{ x: "left or right", y: "up or down", xy: "in any direction" }[elbow.axis]} to move the line · double-click to reset`}
            role="slider"
            aria-label="Arrow bend"
            aria-valuetext={data?.bend ? `moved ${Math.round(data.bend.x)}, ${Math.round(data.bend.y)}` : "default"}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(FlowEdge);
