import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.host_permissions, ["https://chat.deepseek.com/*"]);
assert(!manifest.permissions.includes("tabs"));
assert(!manifest.permissions.includes("cookies"));
assert.equal(manifest.side_panel.default_path, "sidepanel.html");
const assets = new Set([
  "sidepanel.html", "sidepanel.css", "sidepanel.js", "shared.js", "content.js",
  manifest.background.service_worker, ...Object.values(manifest.icons),
]);
for (const path of assets) {
  await access(resolve(root, path));
  if (path.endsWith(".js")) execFileSync(process.execPath, ["--check", resolve(root, path)]);
}
const html = await readFile(resolve(root, "sidepanel.html"), "utf8");
assert(!/https?:\/\/[^"'\s>]+/.test(html.replace(/title="[^"]*"/g, "")), "Website URL must be set by JS after bridge setup.");
assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), "No inline scripts.");
const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1].trim();
assert(/^<iframe\b[^>]*><\/iframe>$/.test(body), "Sidebar body must contain ONLY the official website iframe.");
assert(!/<(?:header|footer|button|textarea|input|form|nav)\b/i.test(html), "No custom UI.");
console.log("Manifest, permission scope, iframe-only container, assets and JavaScript syntax: PASS");
