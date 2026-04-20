import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // CrowdCircuit brand palette — a late-night neon dusk.
        ink: "#0b0a1a",
        ember: "#ff4f7b",
        neon: "#7cf8d0",
        sol: "#ffd36e",
        orchid: "#b080ff",
        slate1: "#1b1930",
        slate2: "#2a2745",
        mist: "#e9e6ff",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        halo: "0 0 0 1px rgba(255,255,255,0.08), 0 20px 60px -20px rgba(176,128,255,0.6)",
        glow: "0 0 40px rgba(124,248,208,0.35)",
      },
      animation: {
        pulseSoft: "pulseSoft 2.2s ease-in-out infinite",
        floaty: "floaty 6s ease-in-out infinite",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "0.85" },
          "50%": { opacity: "1" },
        },
        floaty: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
