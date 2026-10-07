// Renders store-assets-fa-v2/html/*.html to 1080x1920 (9:16) PNGs in store-assets-fa-v2/out/.
// Run from the repo root:  node store-assets-fa-v2/render.mjs [prefix ...]
// Optional prefixes (e.g. `02 04`) limit the run to those pages; with none, every page is rendered.
import { chromium } from "@playwright/test";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const htmlDir = join(root, "html");
const outDir = join(root, "out");
mkdirSync(outDir, { recursive: true });

const only = process.argv.slice(2);
const pages = readdirSync(htmlDir)
  .filter((f) => /^\d{2}-.*\.html$/.test(f))
  .filter((f) => only.length === 0 || only.some((p) => f.startsWith(p)))
  .sort();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });

for (const file of pages) {
  await page.goto(pathToFileURL(resolve(htmlDir, file)).href);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))),
    );
  });
  const out = join(outDir, `${file.replace(/\.html$/, "")}-1080x1920.png`);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  console.log("wrote", out);
}

await browser.close();
