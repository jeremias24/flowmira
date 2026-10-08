// ── NEW ── whole file
import ThemeSwitcher from "./ThemeSwitcher";

/** Shown while signing in, and when there's no session (Flowmira is opened from the IPC portal). */
export default function SignInScreen({ busy, message }: { busy: boolean; message: string }) {
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
      </header>
      {busy ? (
        <p role="status" className="mt-11 text-ink-2">
          Signing you in…
        </p>
      ) : (
        <section className="mt-11 max-w-[560px]">
          <p role="alert" className="m-0 rounded border border-line bg-paper px-3.5 py-3">
            {message}
          </p>
          <p className="mt-3 text-sm text-ink-2">
            Sign in to the IPC portal and open Flowmira from your list of systems.
          </p>
        </section>
      )}
    </main>
  );
}
