/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        board: {
          DEFAULT: "#1F3A2E",
          light: "#2C4F3E",
          dark: "#152A21",
        },
        paper: "#F6F1E4",
        paper2: "#EFE7D2",
        ink: "#2B2620",
        turmeric: {
          DEFAULT: "#E8A93B",
          dark: "#C98E24",
          light: "#F3C876",
        },
        brick: {
          DEFAULT: "#C0472A",
          dark: "#9A3620",
        },
        steel: "#7C8B85",
        sage: "#4C7A64",
      },
      fontFamily: {
        chalk: ["'Kalam'", "cursive"],
        body: ["'Work Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      backgroundImage: {
        "chalk-texture":
          "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.03) 0%, transparent 40%), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.02) 0%, transparent 45%)",
      },
    },
  },
  plugins: [],
};
