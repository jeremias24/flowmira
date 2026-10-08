// Relationship line with crow's-foot notation drawn in the edge itself (so it exports).
import { memo } from "react";
import { BaseEdge, Position, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { Cardinality } from "./types";

export type RelationEdgeData = { fromCard: Cardinality; toCard: Cardinality; active: boolean; name?: string };
export type RelationEdgeType = Edge<RelationEdgeData, "relation">;

/** Cardinality mark at one end. `dir` = direction pointing away from the table (+1 right, -1 left). */
function mark(x: number, y: number, dir: number, card: Cardinality): string {
  if (card === "*") {
    // Crow's foot: three prongs spreading into the table, plus a bar for "one or more".
    const tip = x + dir * 14;
    return `M ${tip},${y} L ${x},${y - 7} M ${tip},${y} L ${x},${y} M ${tip},${y} L ${x},${y + 7} M ${x + dir * 18},${y - 6} L ${x + dir * 18},${y + 6}`;
  }
  // "Exactly one": two bars.
  return `M ${x + dir * 9},${y - 6} L ${x + dir * 9},${y + 6} M ${x + dir * 14},${y - 6} L ${x + dir * 14},${y + 6}`;
}

function RelationEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<RelationEdgeType>) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, offset: 24, borderRadius: 6 });
  const sDir = sourcePosition === Position.Right ? 1 : -1;
  const tDir = targetPosition === Position.Right ? 1 : -1;
  const cls = data?.active ? "erd-rel erd-rel--active" : "erd-rel";
  return (
    <>
      <BaseEdge path={path} className={cls} interactionWidth={14} />
      <path d={mark(sourceX, sourceY, sDir, data?.fromCard ?? "*")} className={`${cls} erd-rel__mark`} fill="none" />
      <path d={mark(targetX, targetY, tDir, data?.toCard ?? "1")} className={`${cls} erd-rel__mark`} fill="none" />
    </>
  );
}

export default memo(RelationEdge);
