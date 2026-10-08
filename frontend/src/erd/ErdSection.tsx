import { useCallback, useEffect, useState } from "react";
import { Code2, Database, Eye } from "lucide-react";
import { Button } from "../components/ui";
import { erdApi } from "./api";
import { SAMPLE_DBML } from "./dbml";
import ConnectDialog from "./ConnectDialog";
import type { ErdDocSummary } from "./types";

const fmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Home page section of the ERD module (flowmira-erd service). */
export default function ErdSection({
  onOpen,
}: {
  onOpen: (id: number) => void;
}) {
  const [docs, setDocs] = useState<ErdDocSummary[]>([]);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    try {
      setDocs(await erdApi.list());
      setError("");
    } catch (e) {
      setError(
        `The ERD service isn't reachable (flowmira-erd). ${e instanceof Error ? e.message : ""}`,
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const newDbml = async () => {
    try {
      const d = await erdApi.create({
        title: "Untitled ERD",
        dbml: SAMPLE_DBML,
        source: "dbml",
      });
      onOpen(d.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (d: ErdDocSummary) => {
    if (!window.confirm(`Delete "${d.title}"? This can't be undone.`)) return;
    await erdApi.remove(d.id);
    await load();
  };

  return (
    <section className="mt-11" aria-labelledby="erd-heading">
      <h2 id="erd-heading" className="mb-1 text-[17px] font-bold">
        Database diagrams (ERD)
      </h2>
      <p className="mt-0 mb-3.5 text-sm text-ink-2">
        See the tables and relationships of a real database, or design one in
        DBML like dbdiagram.io.
      </p>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded border border-danger/40 bg-danger-soft px-3.5 py-3 text-danger"
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
        <button
          type="button"
          onClick={() => setConnecting(true)}
          className="flex cursor-pointer flex-col gap-1 rounded-[3px] border border-l-[6px] border-line border-l-[#2B5F9E] bg-paper px-[18px] pt-[18px] pb-4 text-left hover:border-ink"
        >
          <span className="flex items-center gap-2 text-[20px] font-extrabold">
            <Database className="size-5" aria-hidden="true" /> Connect to a
            database
          </span>
          <span className="text-sm text-ink-2">
            PostgreSQL, MySQL / MariaDB, SQL Server. View only.
          </span>
        </button>
        <button
          type="button"
          onClick={() => void newDbml()}
          className="flex cursor-pointer flex-col gap-1 rounded-[3px] border border-l-[6px] border-line border-l-[#4F46B5] bg-paper px-[18px] pt-[18px] pb-4 text-left hover:border-ink"
        >
          <span className="flex items-center gap-2 text-[20px] font-extrabold">
            <Code2 className="size-5" aria-hidden="true" /> New DBML diagram
          </span>
          <span className="text-sm text-ink-2">
            Write tables in code, see the ERD live.
          </span>
        </button>
      </div>

      {docs.length > 0 && (
        <ul className="mt-4 mb-0 list-none border-t border-line p-0">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 border-b border-line"
            >
              <button
                type="button"
                onClick={() => onOpen(d.id)}
                className="group flex flex-1 cursor-pointer flex-col px-1 py-3.5 text-left"
              >
                <span className="flex items-center gap-2 text-base font-bold decoration-mark decoration-[3px] group-hover:underline">
                  {d.title}
                  {d.source === "database" && (
                    <span className="flex items-center gap-1 rounded-[3px] border border-line px-1.5 text-[11px] font-semibold text-ink-2 no-underline">
                      <Eye className="size-3" aria-hidden="true" /> live
                      database
                    </span>
                  )}
                </span>
                <span className="text-[13px] text-ink-2">
                  ERD{d.source === "dbml" ? " (DBML)" : ""}, edited{" "}
                  {fmt.format(new Date(d.updated_at))}
                </span>
              </button>
              <Button variant="ghost" size="sm" onClick={() => void remove(d)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}

      {connecting && (
        <ConnectDialog
          title="Connect to a database"
          submitLabel="Read schema"
          onClose={() => setConnecting(false)}
          onSubmit={async (form) => {
            const result = await erdApi.introspect(form);
            const where = result.source_info.schema
              ? `${result.source_info.database}.${result.source_info.schema}`
              : result.source_info.database;
            const d = await erdApi.create({
              title: where,
              dbml: result.dbml,
              source: "database",
              source_info: result.source_info,
            });
            setConnecting(false);
            onOpen(d.id);
          }}
        />
      )}
    </section>
  );
}
