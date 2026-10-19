import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Whisper en el navegador necesita "cross-origin isolation" (SharedArrayBuffer).
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ["@remotion/whisper-web"] },
  server: {
    port: 5173,
    headers: isolation,
    proxy: {
      "/api": "http://localhost:3001",
      "/media": "http://localhost:3001",
      "/out": "http://localhost:3001",
    },
  },
  preview: { headers: isolation },
});
