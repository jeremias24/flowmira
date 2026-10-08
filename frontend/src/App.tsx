import { Suspense, lazy, useState } from "react";
import DiagramList from "./components/DiagramList";
import Editor from "./components/Editor";

// The ERD module (flowmira-erd) loads only when an ERD is opened.
const ErdEditor = lazy(() => import("./erd/ErdEditor"));

/** What's on screen: the home page, a diagram (flowmira-diagram) or an ERD (flowmira-erd). */
type View =
  | { kind: "home" }
  | { kind: "diagram"; id: number }
  | { kind: "erd"; id: number };

export default function App() {
  const [view, setView] = useState<View>({ kind: "home" });
  const home = () => setView({ kind: "home" });
  if (view.kind === "diagram")
    return <Editor key={`d${view.id}`} diagramId={view.id} onBack={home} />;
  if (view.kind === "erd") {
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
          onOpen={(id) => setView({ kind: "erd", id })}
        />
      </Suspense>
    );
  }
  return (
    <DiagramList
      onOpen={(id) => setView({ kind: "diagram", id })}
      onOpenErd={(id) => setView({ kind: "erd", id })}
    />
  );
}
