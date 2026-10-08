import { Suspense, lazy, useEffect, useState } from "react"; // ── FIX ── + useEffect
import DiagramList from "./components/DiagramList";
import Editor from "./components/Editor";
import SignInScreen from "./components/SignInScreen"; // ── NEW ──
import { SIGNED_OUT_EVENT, api, errorMessage } from "./api"; // ── NEW ──
import type { Me, Opened } from "./types"; // ── NEW ── (+ Opened)
import { erdApi } from "./erd/api"; // ── NEW ── look up an ERD from its address

// The ERD module (flowmira-erd) loads only when an ERD is opened.
const ErdEditor = lazy(() => import("./erd/ErdEditor"));

/** What's on screen: the home page, a diagram (flowmira-diagram) or an ERD (flowmira-erd). */
// ── FIX ── ref = the encrypted id shown in the address. id is missing while a refreshed or pasted
// address is being looked up.
type View =
  | { kind: "home" }
  | { kind: "diagram" | "erd"; ref: string; id?: number };

// ── NEW ── Who is signed in. The server decides; this only picks what to show.
type Auth =
  | { status: "checking" }
  | { status: "signed-in"; me: Me }
  | { status: "signed-out"; message: string };

const NOT_SIGNED_IN = "You're not signed in to Flowmira.";

/** The portal opens /authenticate/<credentials>; base64 can contain "/", so take the rest of the path. */
// ── FIX ── Resolve the portal hand-off relative to the configured deployment path.
const appBase = import.meta.env.BASE_URL;
const appPath = window.location.pathname.startsWith(appBase)
  ? window.location.pathname.slice(appBase.length)
  : "";
const portalCredentials = /^authenticate\/(.+?)\/?$/.exec(appPath)?.[1] ?? null;

// ── NEW ── The open diagram or ERD is kept in the address, so refreshing the browser reopens it.
// ── FIX ── The address holds the server's encrypted ref (/flowmira/diagram/<ref>), not the id.
// Old number addresses (/flowmira/diagram/12) aren't refs and open the home page.
function viewFromPath(path: string): View {
  const m = /^(diagram|erd)\/([A-Za-z0-9_-]{16,64})\/?$/.exec(path);
  return m ? { kind: m[1] as "diagram" | "erd", ref: m[2] as string } : { kind: "home" };
}

function pathOf(view: View): string {
  return view.kind === "home" ? appBase : `${appBase}${view.kind}/${view.ref}`;
}

/** One sign-in per page load, shared by both runs of the effect in React's development StrictMode. */
let startup: Promise<Me> | null = null;

export default function App() {
  // ── FIX ── Start on the page in the address (a refresh), except right after the portal sign-in link.
  const [view, setViewState] = useState<View>(() =>
    portalCredentials ? { kind: "home" } : viewFromPath(appPath),
  );
  const [auth, setAuth] = useState<Auth>({ status: "checking" });
  // ── NEW ── Every change of page updates the address too. replaceState, not pushState: the browser's
  // Back button keeps working as before (it doesn't step through diagrams, which could skip the
  // editor's "unsaved changes" question).
  const setView = (next: View) => {
    setViewState(next);
    const path = pathOf(next);
    if (window.location.pathname !== path) window.history.replaceState(null, "", path);
  };
  const home = () => setView({ kind: "home" });
  const open = (kind: "diagram" | "erd") => (d: Opened) => setView({ kind, id: d.id, ref: d.ref }); // ── NEW ──
  // ── NEW ── Set when an address's diagram doesn't exist, isn't yours, or the ref was altered.
  const [notFound, setNotFound] = useState<string | null>(null);

  // ── NEW ── Sign in from the portal link, or pick up an existing session.
  useEffect(() => {
    // Drop the sign-in link from the address bar and history straight away.
    if (portalCredentials) window.history.replaceState(null, "", appBase);
    // ── NEW ── An address that isn't a page (e.g. an old /diagram/12) shows home: say so in the address too.
    else if (viewFromPath(appPath).kind === "home" && window.location.pathname !== appBase)
      window.history.replaceState(null, "", appBase);
    startup ??= portalCredentials ? api.login(portalCredentials) : api.me();
    startup
      .then((me) => setAuth({ status: "signed-in", me }))
      .catch((e) =>
        setAuth({ status: "signed-out", message: portalCredentials ? errorMessage(e) : NOT_SIGNED_IN }),
      );
  }, []);

  // ── NEW ── Any 401 later on (session expired, access removed in UMS) ends the session here too.
  useEffect(() => {
    const onSignedOut = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setAuth({ status: "signed-out", message: detail || NOT_SIGNED_IN });
      setView({ kind: "home" });
    };
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, []);

  const signOut = async () => {
    await api.logout().catch(() => undefined);
    setAuth({ status: "signed-out", message: "You've signed out of Flowmira." });
    setView({ kind: "home" });
  };

  // ── NEW ── A refreshed or pasted address: find the diagram/ERD behind its ref (same access checks as opening it).
  useEffect(() => {
    if (auth.status !== "signed-in" || view.kind === "home" || view.id !== undefined) return;
    if (view.kind === "erd" && auth.me.role !== "owner") return; // goes home, below
    let cancelled = false;
    const { kind, ref } = view;
    setNotFound(null);
    (kind === "diagram" ? api.getDiagramByRef(ref) : erdApi.getByRef(ref))
      .then((d) => {
        if (!cancelled) setViewState({ kind, ref, id: d.id });
      })
      .catch((e) => {
        if (!cancelled) setNotFound(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [auth, view]);

  // ── NEW ── An ERD address opened by someone who isn't a system owner shows the home page; fix the address.
  useEffect(() => {
    if (auth.status === "signed-in" && view.kind === "erd" && auth.me.role !== "owner") home();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (auth.status !== "signed-in")
    return (
      <SignInScreen
        busy={auth.status === "checking"}
        message={auth.status === "signed-out" ? auth.message : ""}
      />
    );
  const { me } = auth;

  // ── NEW ── Looking up an address (a refresh or a pasted link).
  if (view.kind !== "home" && view.id === undefined && !(view.kind === "erd" && me.role !== "owner"))
    return (
      <main className="mx-auto max-w-[880px] px-6 pt-14 pb-20">
        {notFound === null ? (
          <p role="status" className="text-ink-2">Opening…</p>
        ) : (
          <section className="max-w-[560px]">
            <p role="alert" className="m-0 rounded border border-line bg-paper px-3.5 py-3">
              This {view.kind === "erd" ? "ERD" : "diagram"} wasn&apos;t found. It may have been deleted, the link
              may be incomplete, or it belongs to someone else.
            </p>
            <button
              type="button"
              onClick={home}
              className="mt-3 cursor-pointer text-ink underline decoration-mark decoration-2 underline-offset-2"
            >
              Back to diagrams
            </button>
          </section>
        )}
      </main>
    );

  if (view.kind === "diagram" && view.id !== undefined) // ── FIX ── + id check
    return <Editor key={`d${view.id}`} diagramId={view.id} onBack={home} />;
  // ── FIX ── ERDs are for system owners only (the server refuses them too).
  if (view.kind === "erd" && view.id !== undefined && me.role === "owner") { // ── FIX ── + id check
    return (
      <Suspense
        fallback={
          <div className="p-12 text-center text-ink-2">Loading ERD…</div>
        }
      >
        <ErdEditor
          key={`e${view.id}`}
          docId={view.id}
          onBack={home}
          onOpen={open("erd")} // ── FIX ── id + ref
        />
      </Suspense>
    );
  }
  return (
    <DiagramList
      me={me}
      onSignOut={() => void signOut()}
      onOpen={open("diagram")} // ── FIX ── id + ref
      onOpenErd={open("erd")}
    />
  );
}
