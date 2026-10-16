import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** Files in web/public, as paths relative to the site root. */
function publicFiles(dir = "web/public", prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? publicFiles(join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`],
  );
}

/**
 * Writes sw.js (from web/sw.js) with the list of files to keep offline and a
 * version that changes whenever any of them does. Font files other than the
 * Latin WOFF2 ones are left out of the list; the service worker stores them
 * the first time they're used.
 */
function serviceWorker(): Plugin {
  return {
    name: "adaptype-service-worker",
    apply: "build",
    // Runs after Vite has added index.html to the bundle.
    enforce: "post",
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((file) => {
        if (/\.(woff2?|ttf)$/.test(file)) return file.endsWith(".woff2") && file.includes("-latin-") && !file.includes("-latin-ext-");
        return !file.endsWith(".map");
      });
      const files = [...built, ...publicFiles()].sort();
      const hash = createHash("sha256");
      for (const file of built) {
        const item = bundle[file];
        hash.update(file).update(item.type === "chunk" ? item.code : item.source);
      }
      for (const file of publicFiles()) hash.update(file).update(readFileSync(join("web/public", file)));
      const version = hash.digest("hex").slice(0, 12);
      const source = readFileSync("web/sw.js", "utf8")
        .replace('"__VERSION__"', JSON.stringify(version))
        .replace("__PRECACHE__", JSON.stringify(files));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

// GitHub Pages serves the site from /<repo>/, so the build uses that as its base.
// Set ADAPTYPE_BASE to override (for example "/" for a custom domain).
export default defineConfig({
  root: "web",
  base: process.env.ADAPTYPE_BASE ?? "/AdapType/",
  build: { outDir: "../dist", emptyOutDir: true },
  plugins: [serviceWorker()],
  test: { root: ".", include: ["engine/test/**/*.test.ts", "web/test/**/*.test.ts"] },
});
