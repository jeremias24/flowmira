// DBML → ErdSchema, using @dbml/core (the parser behind dbdiagram.io, Apache-2.0).
// Loaded on demand so the main Flowmira bundle stays small.
import type {
  DbmlError,
  ErdColumn,
  ErdRef,
  ErdSchema,
  ErdTable,
} from "./types";

/* Minimal shapes of the @dbml/core objects we read. */
interface DField {
  name: string;
  type: { type_name: string };
  pk?: boolean;
  not_null?: boolean;
  unique?: boolean;
  increment?: boolean;
  dbdefault?: { type: string; value: string | number };
  note?: string;
}
interface DIndex {
  pk?: boolean;
  unique?: boolean;
  columns: { value: string }[];
}
interface DTable {
  name: string;
  fields: DField[];
  indexes: DIndex[];
  note?: string;
  headerColor?: string;
}
interface DEndpoint {
  schemaName: string | null;
  tableName: string;
  fieldNames: string[];
  relation: "1" | "*";
}
interface DRef {
  name?: string | null;
  endpoints: [DEndpoint, DEndpoint];
}
interface DSchema {
  name: string;
  tables: DTable[];
  refs: DRef[];
}

const DEFAULT_SCHEMA = "public";
const tableId = (schema: string | null | undefined, name: string) =>
  !schema || schema === DEFAULT_SCHEMA ? name : `${schema}.${name}`;

/**
 * Load only the DBML grammar and the schema model from @dbml/core (~350 KB), not the whole
 * package, which also bundles SQL parsers for every dialect (~11 MB).
 * This is exactly what Parser.parse(text, "dbml") does internally.
 */
type CjsModule<T> = { default?: T | { default?: T } } & Partial<T>;
const unwrap = <T>(m: CjsModule<T>): T => {
  const d = m.default as (T & { default?: T }) | undefined;
  return (d && "default" in d && d.default ? d.default : (d ?? m)) as T;
};
let dbmlLib: Promise<{
  peg: { parse: (s: string) => unknown };
  Database: new (raw: unknown) => { schemas: DSchema[] };
}> | null = null;
const loadDbml = () =>
  (dbmlLib ??= Promise.all([
    import("@dbml/core/lib/parse/dbmlParser"),
    import("@dbml/core/lib/model_structure/database"),
  ]).then(([p, d]) => ({
    peg: unwrap(p as CjsModule<{ parse: (s: string) => unknown }>),
    Database: unwrap(
      d as CjsModule<new (raw: unknown) => { schemas: DSchema[] }>,
    ),
  })));

type Located = {
  message?: string;
  location?: { start?: { line?: number; column?: number } };
};
function toError(e: unknown): DbmlError {
  // Grammar errors carry a location; model errors (e.g. unknown table in a Ref) may come as a list.
  const first = (
    Array.isArray(e) ? e[0] : ((e as { diags?: unknown[] })?.diags?.[0] ?? e)
  ) as Located | undefined;
  return {
    message: first?.message ?? String(e),
    line: first?.location?.start?.line,
    column: first?.location?.start?.column,
  };
}

export async function parseDbml(
  text: string,
): Promise<{ schema: ErdSchema } | { error: DbmlError }> {
  if (!text.trim()) return { schema: { tables: [], refs: [] } };
  const { peg, Database } = await loadDbml();
  let db: { schemas: DSchema[] };
  try {
    db = new Database(peg.parse(text));
  } catch (e) {
    return { error: toError(e) };
  }

  const tables: ErdTable[] = [];
  const refs: ErdRef[] = [];
  for (const s of db.schemas) {
    for (const t of s.tables) {
      const compositePk = new Set(
        t.indexes
          .filter((i) => i.pk)
          .flatMap((i) => i.columns.map((c) => c.value)),
      );
      const singleUnique = new Set(
        t.indexes
          .filter((i) => i.unique && i.columns.length === 1)
          .map((i) => i.columns[0]?.value ?? ""),
      );
      const columns: ErdColumn[] = t.fields.map((f) => ({
        name: f.name,
        type: f.type.type_name,
        pk: Boolean(f.pk) || compositePk.has(f.name),
        fk: false,
        notNull: Boolean(f.not_null) || Boolean(f.pk),
        unique: Boolean(f.unique) || singleUnique.has(f.name),
        increment: Boolean(f.increment),
        ...(f.dbdefault ? { default: String(f.dbdefault.value) } : {}),
        ...(f.note ? { note: f.note } : {}),
      }));
      tables.push({
        id: tableId(s.name, t.name),
        name: t.name,
        ...(s.name && s.name !== DEFAULT_SCHEMA ? { schema: s.name } : {}),
        columns,
        ...(t.note ? { note: t.note } : {}),
        ...(t.headerColor ? { headerColor: t.headerColor } : {}),
      });
    }
    s.refs.forEach((r, i) => {
      const [a, b] = r.endpoints;
      refs.push({
        id: `${s.name}-ref-${i}`,
        ...(r.name ? { name: r.name } : {}),
        from: {
          table: tableId(a.schemaName ?? s.name, a.tableName),
          columns: a.fieldNames,
          card: a.relation,
        },
        to: {
          table: tableId(b.schemaName ?? s.name, b.tableName),
          columns: b.fieldNames,
          card: b.relation,
        },
      });
    });
  }

  // Foreign-key markers: the "many" side, or the declaring side of a one-to-one.
  const byId = new Map(tables.map((t) => [t.id, t]));
  for (const r of refs) {
    const side =
      r.from.card === "*" ? r.from : r.to.card === "*" ? r.to : r.from;
    const t = byId.get(side.table);
    t?.columns.forEach((c) => {
      if (side.columns.includes(c.name)) c.fk = true;
    });
  }
  return { schema: { tables, refs } };
}

/** Starter DBML for a new diagram. */
export const SAMPLE_DBML = `// Write DBML on the left; the diagram updates as you type.
// Docs: https://dbml.dbdiagram.io/docs

Table users {
  id integer [pk, increment]
  email varchar(160) [unique, not null]
  full_name varchar(120) [not null]
  role varchar(20) [not null, default: 'requester']
  created_at timestamp [default: \`now()\`]
}

Table approval_requests {
  id integer [pk, increment]
  requester_id integer [not null, ref: > users.id]
  approver_id integer [ref: > users.id]
  title varchar(200) [not null]
  status varchar(20) [not null, default: 'pending']
  created_at timestamp [default: \`now()\`]
}

Table approval_tokens {
  request_id integer [pk, ref: - approval_requests.id]
  token varchar(64) [not null]
  expires_at timestamp [not null]
}

Table email_log {
  request_id integer [ref: > approval_requests.id]
  attempt integer
  sent_at timestamp
  delivery_status varchar(20)

  Indexes {
    (request_id, attempt) [pk]
  }
}
`;
