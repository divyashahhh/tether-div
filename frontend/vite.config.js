import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.TETHER_BACKEND || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    // 0.0.0.0 so phones/laptops on the same Wi-Fi can open http://<this-computer-ip>:5173
    host: "0.0.0.0",
    port: 5173,
    // Every device only talks to this one port; Vite forwards API + WebSocket traffic.
    proxy: {
      "/api": { target: backend, changeOrigin: true, ws: true }
    }
  }
});
