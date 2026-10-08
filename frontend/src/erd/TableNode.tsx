import { memo, type CSSProperties } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { KeyRound, Link2 } from "lucide-react";
import type { ErdColumn, ErdTable } from "./types";

export type TableNodeData = { table: ErdTable; active: boolean };
export type TableNodeType = Node<TableNodeData, "table">;

const DEFAULT_HEADER = "#2B5F9E";

function details(c: ErdColumn): string {
  return [
    `${c.name}: ${c.type}`,
    c.pk && "primary key",
    c.fk && "foreign key",
    c.increment && "auto-increment",
    c.notNull && !c.pk && "not null",
    c.unique && !c.pk && "unique",
    c.default !== undefined && `default ${c.default}`,
    c.note && `— ${c.note}`,
  ].filter(Boolean).join(" · ");
}

function TableNode({ data, selected }: NodeProps<TableNodeType>) {
  const { table } = data;
  return (
    <div
      className={`erd-table${selected || data.active ? " erd-table--active" : ""}`}
      style={{ "--erd-head": table.headerColor ?? DEFAULT_HEADER } as CSSProperties}
      title={table.note}
    >
      <header className="erd-table__head">
        {table.schema && <span className="erd-table__schema">{table.schema}.</span>}
        <span className="erd-table__name">{table.name}</span>
      </header>
      {table.columns.map((c) => (
        <div key={c.name} className={`erd-col${c.pk ? " erd-col--pk" : ""}`} title={details(c)}>
          {/* Hidden connection points for relationship lines, one per side per column. */}
          <Handle type="source" position={Position.Left} id={`${c.name}-l`} isConnectable={false} className="erd-handle" />
          <span className="erd-col__key" aria-hidden="true">
            {c.pk ? <KeyRound className="size-3.5" /> : c.fk ? <Link2 className="size-3.5" /> : null}
          </span>
          <span className="erd-col__name">
            {c.name}
            {c.notNull && !c.pk && <span className="erd-col__nn" title="not null">*</span>}
          </span>
          <span className="erd-col__type">{c.type}</span>
          <Handle type="source" position={Position.Right} id={`${c.name}-r`} isConnectable={false} className="erd-handle" />
        </div>
      ))}
      {table.columns.length === 0 && <div className="erd-col erd-col--empty">No columns</div>}
    </div>
  );
}

export default memo(TableNode);
