/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#070606",
        surface: {
          DEFAULT: "#110e0f",
          2: "#181314",
          3: "#221a1b"
        },
        line: "rgba(255, 235, 235, 0.08)",
        fg: "#f5eeee",
        muted: "#a99d9e",
        faint: "#6d6364",
        brand: {
          DEFAULT: "#f0203e",
          bright: "#ff3552",
          deep: "#a3112a",
          wine: "#3d0812",
          blood: "#5e0b19"
        },
        live: "#34d399"
      },
      fontFamily: {
        sans: ["Poppins", "-apple-system", "BlinkMacSystemFont", "SF Pro Text", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 32px -6px rgba(240, 32, 62, 0.55)",
        card: "0 18px 40px -18px rgba(0, 0, 0, 0.8)"
      },
      keyframes: {
        "spin-gradient": { to: { transform: "rotate(360deg)" } },
        "pop-in": {
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          "100%": { opacity: "1", transform: "none" }
        },
        "toast-in": {
          "0%": { opacity: "0", transform: "translateY(-12px)" },
          "100%": { opacity: "1", transform: "none" }
        },
        heartbeat: {
          "0%, 100%": { transform: "scale(1)" },
          "15%": { transform: "scale(1.12)" },
          "30%": { transform: "scale(1)" },
          "45%": { transform: "scale(1.08)" }
        },
        ripple: {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "100%": { transform: "scale(1.9)", opacity: "0" }
        },
        "live-dot": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(52, 211, 153, 0.6)" },
          "50%": { boxShadow: "0 0 0 6px rgba(52, 211, 153, 0)" }
        }
      },
      animation: {
        "spin-gradient": "spin-gradient 4s linear infinite",
        "pop-in": "pop-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
        "toast-in": "toast-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both",
        heartbeat: "heartbeat 1.2s ease-in-out infinite",
        ripple: "ripple 1.4s ease-out infinite",
        "live-dot": "live-dot 2s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
