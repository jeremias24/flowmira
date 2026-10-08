// Arrow animation, driven frame by frame from JavaScript instead of CSS animations.
// Why: a GIF export captures still images. With CSS animations every capture would show
// the same instant; with a "phase" we set ourselves, the screen and every GIF frame show
// exactly the state we choose, and the loop is seamless.
import { createContext, useContext } from "react";

export type ArrowAnimation = "none" | "dashes" | "dots";
export type AnimationSpeed = "slow" | "normal" | "fast";

/**
 * Per speed: how long one loop lasts (= GIF length) and how fast things travel.
 * Each moving dot/dash advances exactly one "spacing" per loop, so loops are seamless.
 */
export const SPEEDS: Record<AnimationSpeed, { label: string; loopMs: number; pxPerSecond: number }> = {
  slow: { label: "Slow", loopMs: 4000, pxPerSecond: 20 },
  normal: { label: "Normal", loopMs: 3000, pxPerSecond: 35 },
  fast: { label: "Fast", loopMs: 2000, pxPerSecond: 60 },
};
export const DEFAULT_SPEED: AnimationSpeed = "normal";
export const isSpeed = (v: unknown): v is AnimationSpeed => typeof v === "string" && v in SPEEDS;

/**
 * GIF frame length. GIF timing is stored in 10 ms steps, so use a whole multiple
 * (80 ms ≈ 12.5 fps: smooth at these speeds, small files) and derive the frame count from
 * it. That way the GIF plays at the same speed as the screen.
 */
export const GIF_FRAME_MS = 80;
export const gifFrameCount = (speed: AnimationSpeed) => Math.max(2, Math.round(SPEEDS[speed].loopMs / GIF_FRAME_MS));

/** Dash pattern for "flowing dashes" (dash + gap). */
export const DASH = 8;
export const GAP = 6;
const DASH_PERIOD = DASH + GAP;

/** Distance between moving dots (= distance travelled per loop). */
export const dotSpacing = (speed: AnimationSpeed) => (SPEEDS[speed].pxPerSecond * SPEEDS[speed].loopMs) / 1000;

/** How many dots an arrow of this (approximate) length gets. */
export const dotCount = (approxLength: number, speed: AnimationSpeed) =>
  Math.max(1, Math.round(approxLength / dotSpacing(speed)));

/** The diagram's animation speed, for arrow components. */
export const AnimationSpeedContext = createContext<AnimationSpeed>(DEFAULT_SPEED);
export const useAnimationSpeed = () => useContext(AnimationSpeedContext);

/**
 * Put every animated arrow under `root` into the state for `phase` (0 = start of the
 * loop, 1 = end, which looks the same as 0).
 */
export function applyPhase(root: ParentNode, phase: number, speed: AnimationSpeed): void {
  // Whole dash periods per loop: always an integer, so the loop is seamless.
  const dashPeriods = Math.max(1, Math.round(dotSpacing(speed) / DASH_PERIOD));
  root.querySelectorAll<SVGPathElement>("path.react-flow__edge-path[data-anim]").forEach((path) => {
    const kind = path.dataset.anim as ArrowAnimation;
    if (kind === "dashes") {
      path.style.strokeDashoffset = String(-phase * DASH_PERIOD * dashPeriods);
    } else if (kind === "dots") {
      const dots = path.parentElement?.querySelectorAll<SVGCircleElement>("circle.flow-dot");
      if (!dots || dots.length === 0) return;
      const length = path.getTotalLength();
      dots.forEach((dot, i) => {
        const t = ((phase + i) / dots.length) % 1;
        const p = path.getPointAtLength(t * length);
        dot.setAttribute("cx", p.x.toFixed(2));
        dot.setAttribute("cy", p.y.toFixed(2));
      });
    }
  });
}

/** Wait for the browser to paint (so a new phase is in the DOM before we capture it). */
export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
