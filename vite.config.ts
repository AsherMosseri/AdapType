import { defineConfig } from "vitest/config";

// GitHub Pages serves the site from /<repo>/, so the build uses that as its base.
// Set ADAPTYPE_BASE to override (for example "/" for a custom domain).
export default defineConfig({
  root: "web",
  base: process.env.ADAPTYPE_BASE ?? "/AdapType/",
  build: { outDir: "../dist", emptyOutDir: true },
  test: { root: ".", include: ["engine/test/**/*.test.ts"] },
});
