// ── NEW ── Present mode: full screen, side panels hidden, canvas read-only. Shared by both editors.
import { useCallback, useEffect, useRef, useState } from "react";
import { useReactFlow, type Viewport } from "@xyflow/react";
import { Presentation, Scan, X } from "lucide-react";
import { isEditableTarget } from "./clipboard";

const FIT = { padding: 0.06, maxZoom: 2, duration: 250 };

/**
 * Present mode for a React Flow canvas. Must be used inside a ReactFlowProvider.
 * Enter: the browser goes full screen; the caller hides the left and right panels (the header
 * stays as it is) and makes the canvas read-only.
 * Leave: Esc (or the browser's own exit), F, or the Exit button; the editor's zoom comes back.
 * Without the Fullscreen API (e.g. in an iframe) only the side panels go away.
 */
export function usePresentation(onEnter?: () => void) {
  const [presenting, setPresenting] = useState(false);
  const { fitView, getViewport, setViewport } = useReactFlow();
  const before = useRef<Viewport | null>(null);
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;

  const enter = useCallback(() => {
    before.current = getViewport();
    onEnterRef.current?.();
    setPresenting(true);
    document.documentElement.requestFullscreen?.().catch(() => {
      // Refused or not allowed here: the side panels are still hidden.
    });
  }, [getViewport]);

  const exit = useCallback(() => {
    setPresenting(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  const fit = useCallback(() => void fitView(FIT), [fitView]);

  // Fit on enter and whenever the screen size changes (going full screen is itself a resize).
  useEffect(() => {
    if (!presenting) return;
    let t = window.setTimeout(fit, 120);
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(fit, 120);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [presenting, fit]);

  // Back in the editor: restore the zoom and position from before.
  useEffect(() => {
    if (presenting || !before.current) return;
    const vp = before.current;
    before.current = null;
    const t = window.setTimeout(() => void setViewport(vp), 120);
    return () => window.clearTimeout(t);
  }, [presenting, setViewport]);

  // The browser left full screen (Esc, F11…): leave present mode too.
  useEffect(() => {
    if (!presenting) return;
    const onChange = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [presenting]);

  // F toggles present mode; Esc leaves it (when the browser didn't go full screen).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isEditableTarget(e.target)) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        if (presenting) exit();
        else enter();
      } else if (e.key === "Escape" && presenting) {
        exit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, enter, exit]);

  return { presenting, enter, exit, fit };
}

/** Hook class for the canvas wrapper while presenting (styles.css hides the editing aids). */
export const PRESENTING_CLASS = "presenting";

/** The "Present" button, in the canvas's top-right corner (the header is left as it is). */
export function PresentButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Present: hide side panels, full screen (F)"
      className="absolute top-3 right-3 z-10 inline-flex cursor-pointer items-center gap-1.5 rounded border border-line bg-paper px-2.5 py-1 text-[13px] font-semibold text-ink shadow-sm hover:border-ink-2"
    >
      <Presentation className="size-3.5" aria-hidden="true" /> Present
    </button>
  );
}

/** Small Fit / Exit bar in the corner. Fades out when the mouse rests, back on movement. */
export function PresentBar({ onFit, onExit }: { onFit: () => void; onExit: () => void }) {
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let t = window.setTimeout(() => setAwake(false), 2500);
    const wake = () => {
      setAwake(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setAwake(false), 2500);
    };
    window.addEventListener("pointermove", wake);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointermove", wake);
    };
  }, []);

  const btn =
    "inline-flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1.5 text-[13px] font-semibold text-on-ink hover:bg-on-ink/15";
  return (
    <div
      role="toolbar"
      aria-label="Presentation"
      className={`absolute top-3 right-3 z-10 flex items-center gap-1 rounded bg-ink/85 p-1 shadow-lg transition-opacity duration-300 hover:opacity-100 focus-within:opacity-100 ${awake ? "opacity-100" : "opacity-0"}`}
    >
      <button type="button" onClick={onFit} title="Fit diagram to screen" className={btn}>
        <Scan className="size-4" aria-hidden="true" /> Fit
      </button>
      <button type="button" onClick={onExit} title="Exit (Esc)" className={btn}>
        <X className="size-4" aria-hidden="true" /> Exit
      </button>
    </div>
  );
}
