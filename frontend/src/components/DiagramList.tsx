import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import type { DiagramSummary, TemplateSummary } from "../types";
import { Button } from "./ui";
import ThemeSwitcher from "./ThemeSwitcher";
import ErdSection from "../erd/ErdSection";

const fmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

interface DiagramListProps {
  onOpen: (id: number) => void;
  onOpenErd: (id: number) => void;
}

export default function DiagramList({ onOpen, onOpenErd }: DiagramListProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);
  const [error, setError] = useState("");

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
      onOpen(d.id);
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
        <h2 className="mb-3.5 text-[17px] font-bold">Your diagrams</h2>
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
                  onClick={() => onOpen(d.id)}
                  className="group flex flex-1 cursor-pointer flex-col px-1 py-3.5 text-left"
                >
                  <span className="text-base font-bold decoration-mark decoration-[3px] group-hover:underline">
                    {d.title}
                  </span>
                  <span className="text-[13px] text-ink-2">
                    {nameOf(d.template_key)}, edited{" "}
                    {fmt.format(new Date(d.updated_at))}
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

      <ErdSection onOpen={onOpenErd} />
    </main>
  );
}
