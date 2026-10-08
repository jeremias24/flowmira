import { useCallback, useEffect, useRef, useState } from "react"; // ── FIX ── + useRef
import { Download, Upload } from "lucide-react"; // ── NEW ──
import { api, errorMessage } from "../api";
import type { DiagramSummary, Me, Opened, TemplateSummary } from "../types"; // ── FIX ── + Me, Opened
import { Button } from "./ui";
import ThemeSwitcher from "./ThemeSwitcher";
import ErdSection from "../erd/ErdSection";
// ── NEW ──
import {
  FLOWMIRA_EXT,
  backupEverything,
  downloadFile,
  importFile,
  parseFile,
} from "../backup";

const fmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

interface DiagramListProps {
  me: Me; // ── NEW ──
  onSignOut: () => void; // ── NEW ──
  onOpen: (d: Opened) => void; // ── FIX ── id + encrypted ref (was the id)
  onOpenErd: (d: Opened) => void;
}

export default function DiagramList({ me, onSignOut, onOpen, onOpenErd }: DiagramListProps) {
  // ── NEW ── System Owner / Super User get ERDs and backup/import; everyone else, diagrams only.
  // The server enforces the same rules; this only hides what wouldn't work.
  const isOwner = me.role === "owner";
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);
  const [error, setError] = useState("");
  // ── NEW ── backup / import
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupNotice, setBackupNotice] = useState<{ text: string; problems: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Bumped after an import so the ERD section reloads its own list.
  const [erdListKey, setErdListKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const [t, d] = await Promise.all([
        api.listTemplates(),
        api.listDiagrams(),
      ]);
      setTemplates(t);
      setDiagrams(d);
      setError("");
    } catch (e) {
      setError(
        `Can't reach the API. Check that the backend is running, then refresh. (${errorMessage(e)})`,
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (tpl: TemplateSummary) => {
    try {
      const d = await api.createDiagram({
        title: `Untitled ${tpl.name}`,
        template_key: tpl.key,
      });
      onOpen(d);
    } catch (e) {
      setError(`Couldn't create the diagram: ${errorMessage(e)}`);
    }
  };

  const remove = async (d: DiagramSummary) => {
    if (!window.confirm(`Delete "${d.title}"? This can't be undone.`)) return;
    try {
      await api.deleteDiagram(d.id);
      await load();
    } catch (e) {
      setError(`Couldn't delete the diagram: ${errorMessage(e)}`);
    }
  };

  // ── NEW ── Everything in one .flowmira file, to keep outside Flowmira.
  const backup = async () => {
    setBackupBusy(true);
    setBackupNotice(null);
    try {
      const { file, problems } = await backupEverything();
      const day = new Date().toISOString().slice(0, 10);
      downloadFile(file, `flowmira-backup-${day}`);
      setBackupNotice({
        text: `Backup saved: ${file.diagrams.length} diagram(s), ${file.erds.length} ERD(s). Keep the file somewhere outside this computer's Docker data.`,
        problems,
      });
    } catch (e) {
      setError(`Couldn't make the backup: ${errorMessage(e)}`);
    } finally {
      setBackupBusy(false);
    }
  };

  // ── NEW ── Adds what's in the file; never replaces or deletes anything.
  const importChosen = async (chosen: File | undefined) => {
    if (fileInput.current) fileInput.current.value = ""; // same file can be picked again
    if (!chosen) return;
    setBackupBusy(true);
    setBackupNotice(null);
    try {
      const result = await importFile(parseFile(await chosen.text()));
      setBackupNotice({
        text: `Imported ${result.diagrams} diagram(s) and ${result.erds} ERD(s) from ${chosen.name}.`,
        problems: result.problems,
      });
      await load();
      setErdListKey((k) => k + 1);
    } catch (e) {
      setError(`Couldn't import ${chosen.name}: ${errorMessage(e)}`);
    } finally {
      setBackupBusy(false);
    }
  };

  const nameOf = (key: string) =>
    templates.find((t) => t.key === key)?.name ?? key;

  return (
    <main className="mx-auto max-w-[880px] px-6 pt-14 pb-20">
      <header className="relative">
        <div className="absolute top-0 right-0 max-md:static max-md:mb-6">
          <ThemeSwitcher />
        </div>
        <h1 className="m-0 text-[56px] leading-none font-extrabold tracking-[-0.04em] max-md:text-[40px]">
          Flowmira
        </h1>
        <p className="mt-2 text-[17px] text-ink-2">
          Structured diagrams for process improvement work.
        </p>
        <p className="mt-1 text-[13px] text-ink-2">Version {__APP_VERSION__}</p>
        {/* ── NEW ── */}
        <p className="mt-1 text-[13px] text-ink-2">
          Signed in as <span className="font-semibold text-ink">{me.full_name}</span> ({me.user_type}) ·{" "}
          <button
            type="button"
            onClick={onSignOut}
            className="cursor-pointer text-ink underline decoration-mark decoration-2 underline-offset-2"
          >
            Sign out
          </button>
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded border border-danger/40 bg-danger-soft px-3.5 py-3 text-danger"
        >
          {error}
        </p>
      )}

      <section className="mt-11">
        <h2 className="mb-3.5 text-[17px] font-bold">Start a new diagram</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
          {templates.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => void create(t)}
              style={{ borderLeftColor: t.accent ?? "var(--color-ink)" }}
              className="flex cursor-pointer flex-col gap-1 rounded-[3px] border border-l-[6px] border-line bg-paper px-[18px] pt-[18px] pb-4 text-left hover:border-ink"
            >
              <span className="text-[22px] font-extrabold tracking-[-0.01em]">
                {t.name}
              </span>
              <span className="text-sm text-ink-2">New {t.name} diagram</span>
            </button>
          ))}
          <div
            aria-disabled="true"
            className="flex flex-col gap-1 rounded-[3px] border border-l-[6px] border-dashed border-line px-[18px] pt-[18px] pb-4"
          >
            <span className="text-base font-semibold text-ink-2">
              Fishbone, value stream map
            </span>
            <span className="text-sm text-ink-2">
              Add a JSON template to backend/templates
            </span>
          </div>
        </div>
      </section>

      <section className="mt-11">
        {/* ── FIX ── owners see everyone's diagrams */}
        <h2 className="mb-3.5 text-[17px] font-bold">{isOwner ? "All diagrams" : "Your diagrams"}</h2>
        {diagrams.length === 0 && !error ? (
          <p className="text-ink-2">
            No diagrams yet. Pick a type above to create your first one.
          </p>
        ) : (
          <ul className="m-0 list-none border-t border-line p-0">
            {diagrams.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-3 border-b border-line"
              >
                <button
                  type="button"
                  onClick={() => onOpen(d)}
                  className="group flex flex-1 cursor-pointer flex-col px-1 py-3.5 text-left"
                >
                  <span className="text-base font-bold decoration-mark decoration-[3px] group-hover:underline">
                    {d.title}
                  </span>
                  <span className="text-[13px] text-ink-2">
                    {nameOf(d.template_key)}, edited{" "}
                    {fmt.format(new Date(d.updated_at))}
                    {/* ── NEW ── */}
                    {isOwner && (d.owner_name ? `, by ${d.owner_name}` : ", from before sign-in")}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(d)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── FIX ── key reloads the ERD list after an import. ── FIX ── owners only */}
      {isOwner && <ErdSection key={erdListKey} onOpen={onOpenErd} />}

      {/* ── FIX ── owners only */}
      {isOwner && (
        <section className="mt-11" aria-labelledby="backup-heading">
          <h2 id="backup-heading" className="mb-1 text-[17px] font-bold">
            Backup and restore
          </h2>
          <p className="mb-3.5 text-sm text-ink-2">
            Your diagrams are stored inside Flowmira. Save a {FLOWMIRA_EXT} file to keep them
            safe if Flowmira is removed, or to move them to another installation.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void backup()} disabled={backupBusy}>
              <Download className="mr-1.5 inline size-4 align-[-3px]" aria-hidden="true" />
              Back up everything
            </Button>
            <Button onClick={() => fileInput.current?.click()} disabled={backupBusy}>
              <Upload className="mr-1.5 inline size-4 align-[-3px]" aria-hidden="true" />
              Import {FLOWMIRA_EXT} file
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept={`${FLOWMIRA_EXT},application/json`}
              className="hidden"
              onChange={(e) => void importChosen(e.target.files?.[0])}
            />
          </div>
          {backupBusy && <p className="mt-3 text-sm text-ink-2">Working…</p>}
          {backupNotice && (
            <div role="status" className="mt-3 rounded border border-line bg-paper px-3.5 py-3 text-sm">
              <p className="m-0">{backupNotice.text}</p>
              {backupNotice.problems.length > 0 && (
                <ul className="mt-2 mb-0 pl-5 text-danger">
                  {backupNotice.problems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
