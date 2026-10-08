// ── NEW ── whole file
// .flowmira files: Flowmira's own file format, for backups and moving diagrams between
// installations. Plain JSON, so it stays readable even without Flowmira.
// One diagram or a full backup use the same format, so one importer handles both.
import { api, errorMessage } from "./api";
import { erdApi } from "./erd/api";
import { downloadUrl, safeFileName } from "./exporting";
import type { DiagramData } from "./types";
import type { ErdLayout, SourceInfo } from "./erd/types";

export const FLOWMIRA_EXT = ".flowmira";
const FORMAT = "flowmira";
/** Bump when the file layout changes in a way older importers can't read. */
const FORMAT_VERSION = 1;

export interface FlowmiraDiagram {
  title: string;
  template_key: string;
  data: DiagramData;
  created_at?: string;
  updated_at?: string;
}

export interface FlowmiraErd {
  title: string;
  dbml: string;
  layout: ErdLayout;
  source: "dbml" | "database";
  /** Where a database ERD was read from. Never contains a password. */
  source_info: SourceInfo | null;
  created_at?: string;
  updated_at?: string;
}

export interface FlowmiraFile {
  format: typeof FORMAT;
  version: number;
  exported_at: string;
  app_version: string;
  diagrams: FlowmiraDiagram[];
  erds: FlowmiraErd[];
}

export interface ImportResult {
  diagrams: number;
  erds: number;
  /** Human-readable reasons for anything that was not imported. */
  problems: string[];
}

export function makeFile(diagrams: FlowmiraDiagram[], erds: FlowmiraErd[]): FlowmiraFile {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    app_version: __APP_VERSION__,
    diagrams,
    erds,
  };
}

/** Save a .flowmira file through the browser's download. */
export function downloadFile(file: FlowmiraFile, name: string) {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, `${safeFileName(name)}${FLOWMIRA_EXT}`);
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Every diagram and ERD in this installation, in one file. */
export async function backupEverything(): Promise<{ file: FlowmiraFile; problems: string[] }> {
  const problems: string[] = [];

  const diagrams: FlowmiraDiagram[] = [];
  for (const summary of await api.listDiagrams()) {
    const d = await api.getDiagram(summary.id);
    diagrams.push({
      title: d.title,
      template_key: d.template_key,
      data: d.data,
      created_at: d.created_at,
      updated_at: d.updated_at,
    });
  }

  // The ERD module is a separate service; a backup of the diagrams is still worth having
  // when it is down, so say what's missing instead of failing.
  const erds: FlowmiraErd[] = [];
  try {
    for (const summary of await erdApi.list()) {
      const e = await erdApi.get(summary.id);
      erds.push({
        title: e.title,
        dbml: e.dbml,
        layout: e.layout,
        source: e.source,
        source_info: e.source_info,
        created_at: e.created_at,
        updated_at: e.updated_at,
      });
    }
  } catch (e) {
    problems.push(`Database diagrams (ERD) were not included: ${errorMessage(e)}`);
  }

  return { file: makeFile(diagrams, erds), problems };
}

// ---------- reading a file ----------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A valid ISO date string, or undefined (the server then uses "now"). */
const dateOrUndefined = (v: unknown): string | undefined =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : undefined;

/** Titles are limited to 200 characters by the API. */
const cleanTitle = (v: unknown, fallback: string): string =>
  (typeof v === "string" && v.trim() ? v.trim() : fallback).slice(0, 200);

/** Parse and check a .flowmira file. Throws an Error with a user-facing message. */
export function parseFile(text: string): FlowmiraFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This isn't a Flowmira file (it isn't valid JSON).");
  }
  if (!isObject(raw) || raw.format !== FORMAT) {
    throw new Error("This isn't a Flowmira file.");
  }
  if (typeof raw.version !== "number" || raw.version > FORMAT_VERSION) {
    throw new Error(
      "This file was made by a newer version of Flowmira. Update Flowmira, then import it again.",
    );
  }
  return {
    format: FORMAT,
    version: raw.version,
    exported_at: typeof raw.exported_at === "string" ? raw.exported_at : "",
    app_version: typeof raw.app_version === "string" ? raw.app_version : "",
    diagrams: Array.isArray(raw.diagrams) ? (raw.diagrams as FlowmiraDiagram[]) : [],
    erds: Array.isArray(raw.erds) ? (raw.erds as FlowmiraErd[]) : [],
  };
}

/**
 * Add everything in the file as NEW diagrams and ERDs. Never overwrites or deletes:
 * importing the same file twice gives duplicates, which the user can delete.
 * One bad entry doesn't stop the rest; it's listed in `problems`.
 */
export async function importFile(file: FlowmiraFile): Promise<ImportResult> {
  const result: ImportResult = { diagrams: 0, erds: 0, problems: [] };

  for (const [i, d] of (file.diagrams as unknown[]).entries()) {
    const title = cleanTitle(isObject(d) ? d.title : undefined, `Imported diagram ${i + 1}`);
    if (
      !isObject(d) ||
      typeof d.template_key !== "string" ||
      !isObject(d.data) ||
      !Array.isArray(d.data.items) ||
      !Array.isArray(d.data.edges)
    ) {
      result.problems.push(`"${title}": damaged entry, skipped.`);
      continue;
    }
    try {
      await api.createDiagram({
        title,
        template_key: d.template_key,
        data: d.data as unknown as DiagramData,
        created_at: dateOrUndefined(d.created_at),
        updated_at: dateOrUndefined(d.updated_at),
      });
      result.diagrams++;
    } catch (e) {
      // e.g. "Unknown template 'fishbone'" when the template isn't installed here.
      result.problems.push(`"${title}": ${errorMessage(e)}`);
    }
  }

  for (const [i, e] of (file.erds as unknown[]).entries()) {
    const title = cleanTitle(isObject(e) ? e.title : undefined, `Imported ERD ${i + 1}`);
    if (!isObject(e) || typeof e.dbml !== "string") {
      result.problems.push(`"${title}": damaged entry, skipped.`);
      continue;
    }
    // Belt and braces: a hand-edited file must never put a password into the database.
    let sourceInfo: SourceInfo | null = null;
    if (isObject(e.source_info)) {
      const info: Record<string, unknown> = { ...e.source_info };
      delete info.password;
      sourceInfo = info as unknown as SourceInfo;
    }
    try {
      await erdApi.create({
        title,
        dbml: e.dbml,
        layout: isObject(e.layout) ? (e.layout as ErdLayout) : {},
        source: e.source === "database" ? "database" : "dbml",
        source_info: sourceInfo,
        created_at: dateOrUndefined(e.created_at),
        updated_at: dateOrUndefined(e.updated_at),
      });
      result.erds++;
    } catch (err) {
      result.problems.push(`"${title}": ${errorMessage(err)}`);
    }
  }

  return result;
}
