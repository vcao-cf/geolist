import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Plain static build for GitHub Pages. Deliberately excludes the vinext and
// Cloudflare plugins used by vite.config.ts: those produce a Worker bundle,
// and Pages can only serve static files.
//
// base "./" keeps every asset URL relative, so the same output works at a user
// site root or under a project sub-path like /geolist/ without a rebuild.
export default defineConfig({
  base: "./",
  root: "static",
  publicDir: "../public",
  plugins: [react()],
  build: {
    outDir: "../dist-static",
    emptyOutDir: true,
  },
});
