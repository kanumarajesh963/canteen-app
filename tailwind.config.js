/** @type {import('tailwindcss').Config} */

// Reads a CSS variable holding an "R G B" triplet (defined in src/index.css
// for :root and html.dark) and wires it up so Tailwind's opacity modifiers
// (e.g. bg-paper/50) keep working: rgb(var(--x) / <alpha-value>).
function withCssVar(name) {
  return `rgb(var(${name}) / <alpha-value>)`;
}

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        board: {
          DEFAULT: withCssVar("--color-board"),
          light: withCssVar("--color-board-light"),
          dark: withCssVar("--color-board-dark"),
        },
        paper: withCssVar("--color-paper"),
        paper2: withCssVar("--color-paper2"),
        ink: withCssVar("--color-ink"),
        turmeric: {
          DEFAULT: withCssVar("--color-turmeric"),
          dark: withCssVar("--color-turmeric-dark"),
          light: withCssVar("--color-turmeric-light"),
        },
        brick: {
          DEFAULT: withCssVar("--color-brick"),
          dark: withCssVar("--color-brick-dark"),
        },
        steel: withCssVar("--color-steel"),
        sage: withCssVar("--color-sage"),
        // Replaces the old hardcoded bg-white surfaces (cards, inputs,
        // circular buttons) so they flip to a dark card color in dark mode.
        surface: withCssVar("--color-surface"),
        // Text color for content sitting on gold (turmeric) buttons/pills.
        // Stays dark in both themes so it never washes out in dark mode.
        onbrand: withCssVar("--color-onbrand"),
      },
      fontFamily: {
        sans: ["'Poppins'", "sans-serif"],
        chalk: ["'Poppins'", "sans-serif"],
        body: ["'Poppins'", "sans-serif"],
        mono: ["'Poppins'", "sans-serif"],
      },
      backgroundImage: {
        "chalk-texture":
          "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.03) 0%, transparent 40%), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.02) 0%, transparent 45%)",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        popIn: {
          "0%": { opacity: "0", transform: "scale(0.92) translateY(8px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        bump: {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.18)" },
          "100%": { transform: "scale(1)" },
        },
        tokenReveal: {
          "0%": { opacity: "0", transform: "scale(0.8) rotate(-3deg)" },
          "60%": { opacity: "1", transform: "scale(1.03) rotate(1deg)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(0)" },
        },
      },
      animation: {
        "fade-in-up": "fadeInUp 0.5s ease-out both",
        "fade-in": "fadeIn 0.25s ease-out both",
        "pop-in": "popIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both",
        bump: "bump 0.32s ease-out",
        "token-reveal": "tokenReveal 0.45s cubic-bezier(0.34,1.56,0.64,1) both",
      },
    },
  },
  plugins: [],
};
