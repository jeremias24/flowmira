// Light / Dark / System theme. The choice is remembered in localStorage;
// "system" follows the operating system and updates live when it changes.
// index.html applies the saved theme before React loads, so there's no flash.
import { useCallback, useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";

const KEY = "flowmira-theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

const resolve = (pref: ThemePref): Theme =>
  pref === "system" ? (media().matches ? "dark" : "light") : pref;

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

// One shared state for every component that uses the hook.
let currentPref: ThemePref = readPref();
const listeners = new Set<() => void>();

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(currentPref);
  const [theme, setTheme] = useState<Theme>(() => resolve(currentPref));

  useEffect(() => {
    const sync = () => {
      setPrefState(currentPref);
      setTheme(resolve(currentPref));
    };
    listeners.add(sync);
    const mq = media();
    const onSystemChange = () => {
      if (currentPref === "system") {
        apply(resolve("system"));
        listeners.forEach((l) => l());
      }
    };
    mq.addEventListener("change", onSystemChange);
    return () => {
      listeners.delete(sync);
      mq.removeEventListener("change", onSystemChange);
    };
  }, []);

  const setPref = useCallback((next: ThemePref) => {
    currentPref = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: still works for this visit */
    }
    apply(resolve(next));
    listeners.forEach((l) => l());
  }, []);

  return { pref, theme, setPref };
}
