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
import type { AppEdge } from "../types";

/** Ends closer than this (px, sideways) count as aligned for elbow arrows. */
const ALIGN_TOLERANCE = 10;
const isVertical = (p: Position) => p === Position.Top || p === Position.Bottom;

function elbowPath(
  sx: number, sy: number, sp: Position, tx: number, ty: number, tp: Position, bend?: { x: number; y: number },
): [string, number, number] {
  if (bend && (bend.x || bend.y)) {
    // The user moved the bend: route through the shifted middle point, never auto-straighten.
    const [path, lx, ly] = getSmoothStepPath({
      sourceX: sx, sourceY: sy, sourcePosition: sp, targetX: tx, targetY: ty, targetPosition: tp,
      centerX: (sx + tx) / 2 + bend.x, centerY: (sy + ty) / 2 + bend.y,
    });
    return [path, lx, ly];
  }
  const bothVertical = isVertical(sp) && isVertical(tp);
  const bothHorizontal = !isVertical(sp) && !isVertical(tp);
  const facing = (bothVertical && (sy < ty) === (sp === Position.Bottom))
    || (bothHorizontal && (sx < tx) === (sp === Position.Right));
  if (facing && bothVertical && Math.abs(sx - tx) < ALIGN_TOLERANCE) {
    return [`M ${tx},${sy} L ${tx},${ty}`, tx, (sy + ty) / 2];
  }
  if (facing && bothHorizontal && Math.abs(sy - ty) < ALIGN_TOLERANCE) {
    return [`M ${sx},${ty} L ${tx},${ty}`, (sx + tx) / 2, ty];
  }
  const [path, lx, ly] = getSmoothStepPath({ sourceX: sx, sourceY: sy, sourcePosition: sp, targetX: tx, targetY: ty, targetPosition: tp });
  return [path, lx, ly];
}

/** Which way an elbow arrow's middle segment can move, or null if it has none. */
export function bendAxisOf(sp: Position, tp: Position): "x" | "y" | null {
  if (isVertical(sp) && isVertical(tp)) return "y";
  if (!isVertical(sp) && !isVertical(tp)) return "x";
  return null;
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
  if (kind === "straight") {
    [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  } else if (kind === "curved") {
    [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  } else {
    [path, labelX, labelY] = elbowPath(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, data?.bend);
  }

  const animation = data?.animation ?? "none";
  const speed = useAnimationSpeed();
  // Approximate length, only to decide how many dots to draw; their positions use the real path.
  const dx = Math.abs(targetX - sourceX);
  const dy = Math.abs(targetY - sourceY);
  const approx = kind === "elbow" ? dx + dy : Math.hypot(dx, dy) * (kind === "curved" ? 1.15 : 1);
  const edgeColor = (style as Record<string, unknown> | undefined)?.["--edge"] as string | undefined;

  // Drag handle for the bend of a selected elbow arrow. Only arrows whose two ends face the
  // same way have a movable middle segment: top/bottom ends → it moves up/down,
  // left/right ends → it moves left/right. Mixed ends have a single corner and no handle.
  const bendAxis = bendAxisOf(sourcePosition, targetPosition);
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
        bend: bendAxis === "y"
          ? { x: 0, y: start.y + (ev.clientY - origin.y) / zoom }
          : { x: start.x + (ev.clientX - origin.x) / zoom, y: 0 },
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
        path={path}
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
      {selected && kind === "elbow" && bendAxis && (
        <EdgeLabelRenderer>
          <div
            className={`edge-bend edge-bend--${bendAxis} nodrag nopan no-export`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onPointerDown={startBendDrag}
            onDoubleClick={() => updateEdgeData(id, { bend: undefined })}
            title={`Drag ${bendAxis === "y" ? "up or down" : "left or right"} to move the bend · double-click to reset`}
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
