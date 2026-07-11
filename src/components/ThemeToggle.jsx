import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../lib/ThemeContext.jsx";

// Single tap switches light <-> dark (and drops out of "system" mode).
// className/size let callers fit it into different bars (dark Nav header
// vs. light auth-screen header) without duplicating the button markup.
export default function ThemeToggle({ className = "" }) {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`relative w-9 h-9 rounded-full flex items-center justify-center transition hover:opacity-80 active:scale-95 ${className}`}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
