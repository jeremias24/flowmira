import { useEffect, useRef, useState, type FormEvent } from "react";
import { Database, ShieldCheck, X } from "lucide-react";
import { Button, Field, inputClass } from "../components/ui";
import { erdApi } from "./api";
import type { ConnectionForm, ErdEngine, SourceInfo } from "./types";

const SCHEMA_HINT: Record<string, string> = {
  postgresql: "public",
  mysql: "(the database itself)",
  mssql: "dbo",
  sqlite: "",
};

interface ConnectDialogProps {
  /** Pre-fill (refreshing an existing ERD). The password is never pre-filled. */
  initial?: SourceInfo | null;
  title: string;
  submitLabel: string;
  onSubmit: (form: ConnectionForm) => Promise<void>;
  onClose: () => void;
}

export default function ConnectDialog({
  initial,
  title,
  submitLabel,
  onSubmit,
  onClose,
}: ConnectDialogProps) {
  const [engines, setEngines] = useState<ErdEngine[]>([]);
  const [form, setForm] = useState<ConnectionForm>({
    engine: initial?.engine ?? "postgresql",
    host: initial?.host ?? "",
    port: initial?.port ?? null,
    database: initial?.database ?? "",
    username: initial?.username ?? "",
    password: "",
    schema: initial?.schema ?? "",
    ssl: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const first = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    erdApi
      .engines()
      .then(setEngines)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (patch: Partial<ConnectionForm>) =>
    setForm((f) => ({ ...f, ...patch }));
  const engine = engines.find((e) => e.key === form.engine);
  const isFile = form.engine === "sqlite";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(e) => void submit(e)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-title"
        className="flex max-h-[92vh] w-full max-w-[520px] flex-col gap-3.5 overflow-y-auto rounded-lg border border-line bg-paper p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="connect-title"
            className="m-0 flex items-center gap-2 text-xl font-extrabold"
          >
            <Database className="size-5" aria-hidden="true" /> {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded p-1 text-ink-2 hover:bg-canvas hover:text-ink"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <p className="m-0 flex gap-2 rounded border border-line bg-canvas p-3 text-[13px] text-ink-2">
          <ShieldCheck
            className="mt-0.5 size-4 shrink-0 text-ink"
            aria-hidden="true"
          />
          <span>
            Flowmira reads only the <b className="text-ink">structure</b>{" "}
            (tables, columns, keys), never your data, over a read-only session.
            The password is used once and is{" "}
            <b className="text-ink">not stored</b>. A user with read-only rights
            is enough.
          </span>
        </p>

        <Field label="Database type">
          <select
            ref={first}
            className={inputClass}
            value={form.engine}
            onChange={(e) => set({ engine: e.target.value, port: null })}
          >
            {engines.map((e) => (
              <option key={e.key} value={e.key} disabled={!e.available}>
                {e.label}
                {e.available ? "" : " (driver not installed)"}
              </option>
            ))}
          </select>
        </Field>

        {!isFile && (
          <div className="grid grid-cols-[1fr_110px] gap-2.5">
            <Field label="Host">
              <input
                className={inputClass}
                required
                value={form.host}
                onChange={(e) => set({ host: e.target.value })}
                placeholder="db.company.local"
                autoComplete="off"
              />
            </Field>
            <Field label="Port">
              <input
                className={inputClass}
                type="number"
                min={1}
                max={65535}
                value={form.port ?? ""}
                placeholder={String(engine?.default_port ?? "")}
                onChange={(e) =>
                  set({ port: e.target.value ? Number(e.target.value) : null })
                }
              />
            </Field>
          </div>
        )}
        {!isFile && (
          <p className="-mt-2 m-0 text-[12px] text-ink-2">
            Database on this computer?{" "}
            <code className="rounded bg-canvas px-1">localhost</code> works:
            Flowmira reaches it through Docker. It must accept network
            connections (MySQL:{" "}
            <code className="rounded bg-canvas px-1">
              bind-address = 0.0.0.0
            </code>
            ) and allow a user from Docker&apos;s network (e.g.{" "}
            <code className="rounded bg-canvas px-1">
              &apos;reader&apos;@&apos;172.%&apos;
            </code>
            ).
          </p>
        )}

        <Field
          label={isFile ? "SQLite file path (on the server)" : "Database name"}
        >
          <input
            className={inputClass}
            required
            value={form.database}
            onChange={(e) => set({ database: e.target.value })}
            autoComplete="off"
          />
        </Field>

        {!isFile && (
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Username">
              <input
                className={inputClass}
                value={form.username}
                onChange={(e) => set({ username: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <Field label="Password">
              <input
                className={inputClass}
                type="password"
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
                autoComplete="new-password"
              />
            </Field>
          </div>
        )}

        {!isFile && (
          <div className="grid grid-cols-[1fr_auto] items-end gap-2.5">
            <Field label="Schema (optional)">
              <input
                className={inputClass}
                value={form.schema}
                onChange={(e) => set({ schema: e.target.value })}
                placeholder={SCHEMA_HINT[form.engine] ?? ""}
                autoComplete="off"
              />
            </Field>
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-[13.5px]">
              <input
                type="checkbox"
                className="size-4 accent-ink"
                checked={form.ssl}
                onChange={(e) => set({ ssl: e.target.checked })}
              />
              Use SSL
            </label>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="m-0 rounded border border-danger/40 bg-danger-soft px-3 py-2 text-[13.5px] text-danger"
          >
            {error}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={busy || engines.length === 0}
          >
            {busy ? "Reading schema…" : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
