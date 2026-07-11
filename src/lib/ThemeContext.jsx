import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

// Theme system: "light" | "dark" | "system".
// - "system" (the default) follows the OS/browser prefers-color-scheme and
//   keeps following it live if the user changes it later.
// - Choosing "light" or "dark" explicitly is saved to localStorage and
//   overrides the system preference until the user picks "system" again.
const STORAGE_KEY = "canteen_theme";
const ThemeContext = createContext(null);

function getSystemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

function applyTheme(resolved) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
}

export function ThemeProvider({ children }) {
  // "mode" is what the user chose: light / dark / system.
  const [mode, setModeState] = useState(() => {
    if (typeof window === "undefined") return "system";
    return localStorage.getItem(STORAGE_KEY) || "system";
  });
  // "resolved" is the actual light/dark value currently painted.
  const [resolved, setResolved] = useState(() => {
    if (typeof window === "undefined") return "light";
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return getSystemPrefersDark() ? "dark" : "light";
  });

  // Keep the <html> class in sync whenever the resolved theme changes.
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  // When mode is "system", track the OS preference live.
  useEffect(() => {
    if (mode !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setResolved(e.matches ? "dark" : "light");
    setResolved(mq.matches ? "dark" : "light");
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange);
    };
  }, [mode]);

  const setMode = useCallback((next) => {
    setModeState(next);
    if (next === "system") {
      localStorage.removeItem(STORAGE_KEY);
      setResolved(getSystemPrefersDark() ? "dark" : "light");
    } else {
      localStorage.setItem(STORAGE_KEY, next);
      setResolved(next);
    }
  }, []);

  // One-tap toggle: light <-> dark. If currently following "system", flip
  // to the opposite of whatever is showing right now (becomes an explicit
  // manual override from then on).
  const toggle = useCallback(() => {
    setMode(resolved === "dark" ? "light" : "dark");
  }, [resolved, setMode]);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
