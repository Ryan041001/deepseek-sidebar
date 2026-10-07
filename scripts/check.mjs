import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
assert.equal(pkg.version, manifest.version, "Package and extension versions must match.");
assert.equal(pkg.license, "MIT");
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.host_permissions, ["https://chat.deepseek.com/*"]);
assert(!manifest.permissions.includes("tabs"));
assert(!manifest.permissions.includes("cookies"));
assert.equal(manifest.side_panel.default_path, "sidepanel.html");
assert.deepEqual(manifest.icons,
  Object.fromEntries([16, 32, 48, 128].map((size) => [size, `icons/icon${size}.png`])),
  "Chrome’s native context menu must use the whale icon.");
const assets = new Set([
  "sidepanel.html", "sidepanel.css", "sidepanel.js", "shared.js", "content.js",
  manifest.background.service_worker, ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  "icons/icon.svg", "icons/sidebar.svg", "LICENSE", "NOTICE.md", "README.md", "README.en.md",
  "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md",
  "docs/PRIVACY.md", "docs/TESTING.md", "docs/ARCHITECTURE.md",
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
