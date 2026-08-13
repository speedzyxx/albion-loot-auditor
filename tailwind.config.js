/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#05070c",
          900: "#07090f",
          800: "#0c1018",
          700: "#121826",
          600: "#1a2333",
        },
        gold: {
          400: "#f0c94d",
          500: "#e8b923",
          600: "#c49214",
          700: "#8a680d",
        },
      },
      fontFamily: {
        display: ['"Rajdhani"', "sans-serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(232, 185, 35, 0.12)",
      },
    },
  },
  plugins: [],
};
