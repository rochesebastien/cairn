/**
 * The handful of preferences the app actually keeps.
 *
 * Deliberately small: the repository is the state, so anything that belongs to
 * a cairn lives in `.cairn/`, not here. What is left is how *this machine*
 * likes to look at it.
 */

import { useCallback, useEffect, useState } from "react";
import type { Lang } from "./i18n.js";

const KEY = "cairn.settings";

export interface Settings {
  /** Sidebar starts collapsed to the icon rail. */
  sidebarCollapsed: boolean;
  /** Honour the OS "reduce motion" preference even when it is not set. */
  reduceMotion: boolean;
  /** Interface language. English is the default; the vocabulary never translates. */
  language: Lang;
}

export const DEFAULT_SETTINGS: Settings = {
  sidebarCollapsed: false,
  reduceMotion: false,
  language: "en",
};

export function readSettings(): Settings {
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      sidebarCollapsed: parsed.sidebarCollapsed === true,
      reduceMotion: parsed.reduceMotion === true,
      language: parsed.language === "fr" ? "fr" : "en",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings(): {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  toggle: (key: keyof Settings) => void;
} {
  const [settings, setSettings] = useState<Settings>(readSettings);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // private mode: the choice still holds for this session
    }
    document.documentElement.dataset["motion"] = settings.reduceMotion ? "reduce" : "full";
    document.documentElement.lang = settings.language;
  }, [settings]);

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  }, []);

  const toggle = useCallback((key: keyof Settings) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  return { settings, set, toggle };
}
