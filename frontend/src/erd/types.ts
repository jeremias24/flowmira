// Flowmira ERD module: types shared by the parser, layout and canvas.

export interface ErdColumn {
  name: string;
  type: string;
  pk: boolean;
  /** Part of a relationship on the "many" (or declaring) side. */
  fk: boolean;
  notNull: boolean;
  unique: boolean;
  increment: boolean;
  default?: string;
  note?: string;
}

export interface ErdTable {
  /** Unique id: "table", or "schema.table" outside the default schema. */
  id: string;
  name: string;
  schema?: string;
  columns: ErdColumn[];
  note?: string;
  headerColor?: string;
}

export type Cardinality = "1" | "*";

export interface ErdRef {
  id: string;
  name?: string;
  from: { table: string; columns: string[]; card: Cardinality };
  to: { table: string; columns: string[]; card: Cardinality };
}

export interface ErdSchema {
  tables: ErdTable[];
  refs: ErdRef[];
}

export interface DbmlError {
  message: string;
  line?: number;
  column?: number;
}

/** Saved canvas layout of an ERD document. */
export interface ErdLayout {
  tables?: Record<string, { x: number; y: number }>;
}

// ----- API -----
export interface ErdEngine {
  key: string;
  label: string;
  default_port: number | null;
  available: boolean;
}

export interface ConnectionForm {
  engine: string;
  host: string;
  port: number | null;
  database: string;
  username: string;
  password: string;
  schema: string;
  ssl: boolean;
}

export interface SourceInfo {
  engine: string;
  host: string;
  port: number | null;
  database: string;
  schema: string;
  username: string;
}

export interface IntrospectResult {
  dbml: string;
  tables: number;
  refs: number;
  warnings: string[];
  source_info: SourceInfo;
}

export interface ErdDocSummary {
  id: number;
  title: string;
  source: "dbml" | "database";
  updated_at: string;
}

export interface ErdDoc extends ErdDocSummary {
  dbml: string;
  layout: ErdLayout;
  source_info: SourceInfo | null;
  created_at: string;
}
