import { defineConfig } from "vite";

/**
 * ADR-0013: Preact + Vite, zwei Einstiegspunkte (admin, visu) in EINEM Paket.
 * Der Dev-Server proxyt /api auf den laufenden fachwerk-Prozess, damit die UI
 * gegen echte Daten entwickelt wird.
 */
const apiZiel = process.env["FACHWERK_API"] ?? "http://localhost:8300";

export default defineConfig({
  root: "src",
  base: "./",
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  resolve: {
    alias: { react: "preact/compat", "react-dom": "preact/compat" },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: apiZiel, changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // admin = Monitor/Editoren, visu = schlanker Panel-Client.
        admin: "src/index.html",
        visu: "src/visu.html",
      },
    },
  },
});
