import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const svg = await readFile(resolve(root, "icons/icon.svg"), "utf8");
const browser = await chromium.launch({ channel: "chromium", headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>' + svg);
    await page.screenshot({ path: resolve(root, "icons/icon" + size + ".png"), omitBackground: true });
  }
  console.log("Rendered selected icons/icon.svg into all four Chrome PNG sizes.");
} finally { await browser.close(); }
