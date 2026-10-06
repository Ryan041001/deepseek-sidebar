import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const browser = await chromium.launch({
  channel: "chromium", headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
});
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const name of ["icon", "sidebar"]) {
    const svg = await readFile(resolve(root, "icons/" + name + ".svg"), "utf8");
    for (const size of [16, 32, 48, 128]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent('<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>' + svg);
      await page.screenshot({ path: resolve(root, "icons/" + name + size + ".png"), omitBackground: true });
    }
  }
  console.log("Rendered brand and toolbar icons into all four Chrome PNG sizes.");
} finally { await browser.close(); }
