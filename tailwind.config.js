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
