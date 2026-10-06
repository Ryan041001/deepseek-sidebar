// Real website diagnostic. Fresh profile only: never reads the user's cookies.
// npm run test:live (install Playwright first, or set PLAYWRIGHT_MODULE).
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const profile = await mkdtemp(join(tmpdir(), "deepseek-live-profile-"));
const artifacts = process.env.BROWSER_ARTIFACT_DIR || join(tmpdir(), "deepseek-live-evidence");
await mkdir(artifacts, { recursive: true });
const evidence = { website: "https://chat.deepseek.com/", errors: [], console: [], requests: [], frames: [], realAccountTested: false };
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: process.env.HEADED !== "1", viewport: { width: 430, height: 850 },
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  const matches = (w) => w.url().startsWith("chrome-extension://") && w.url().endsWith("/background.js");
  const worker = context.serviceWorkers().find(matches) || await context.waitForEvent("serviceworker", { predicate: matches });
  const id = new URL(worker.url()).hostname;
  evidence.extensionId = id;
  let rules = [];
  for (let i = 0; i < 100 && !rules.length; i++) {
    rules = await worker.evaluate(() => chrome.declarativeNetRequest?.getDynamicRules() ?? []);
    if (!rules.length) await new Promise((done) => setTimeout(done, 50));
  }
  evidence.rules = rules;
  const panel = await context.newPage();
  panel.on("pageerror", (e) => evidence.errors.push(e.message));
  panel.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") evidence.console.push(m.text()); });
  panel.on("requestfailed", (r) => evidence.requests.push({ failed: r.failure()?.errorText, url: r.url().split("?")[0], type: r.resourceType() }));
  panel.on("response", (r) => {
    if (r.request().isNavigationRequest() || r.status() >= 400) evidence.requests.push({ status: r.status(), url: r.url().split("?")[0], type: r.request().resourceType() });
  });
  await panel.goto(`chrome-extension://${id}/sidepanel.html`, { waitUntil: "domcontentloaded" });
  try {
    await panel.frameLocator("#deepseek-frame").locator("body").waitFor({ state: "visible", timeout: 25000 });
    await panel.waitForTimeout(6000);
  } catch (error) { evidence.errors.push("Official iframe: " + error.message); }
  for (const frame of panel.frames()) {
    evidence.frames.push({
      url: frame.url().split("?")[0],
      title: await frame.title().catch(() => ""),
      bodyText: frame.url().startsWith("https://chat.deepseek.com/")
        ? await frame.locator("body").innerText({ timeout: 3000 }).then((s) => s.slice(0, 1200)).catch(() => "") : "",
      editorCount: await frame.locator("textarea, [contenteditable=true]").count().catch(() => 0),
    });
  }
  await panel.screenshot({ path: join(artifacts, "real-official-iframe.png") });
  // Compare a direct, ordinary official tab without altering website behavior.
  const direct = await context.newPage();
  direct.on("pageerror", (e) => evidence.errors.push("Direct tab: " + e.message));
  try {
    const response = await direct.goto("https://chat.deepseek.com/", { waitUntil: "domcontentloaded", timeout: 25000 });
    await direct.waitForTimeout(3000);
    evidence.direct = { status: response?.status(), url: direct.url(), title: await direct.title(), bodyText: (await direct.locator("body").innerText()).slice(0, 1200) };
  } catch (error) { evidence.direct = { error: error.message }; }
  const embedded = panel.frames().find((f) => f.url().startsWith("https://chat.deepseek.com/"));
  if (embedded && direct.url().startsWith("https://chat.deepseek.com/")) {
    const probe = "__sidebar_debug_probe_" + Date.now();
    await direct.evaluate((key) => { localStorage.setItem(key, "test"); document.cookie = key + "=test; Path=/; SameSite=None; Secure"; }, probe);
    evidence.storageSharing = await embedded.evaluate(async (key) => ({
      localStorageShared: localStorage.getItem(key) === "test",
      cookieShared: document.cookie.split("; ").some((c) => c === key + "=test"),
      hasStorageAccess: typeof document.hasStorageAccess === "function" ? await document.hasStorageAccess() : null,
    }), probe);
    await direct.evaluate((key) => { localStorage.removeItem(key); document.cookie = key + "=; Max-Age=0; Path=/; SameSite=None; Secure"; }, probe);
  }
  const cdp = await context.browser().newBrowserCDPSession();
  const targetsBefore = await cdp.send("Target.getTargets");
  try {
    await panel.evaluate(async () => { const w = await chrome.windows.getCurrent(); await chrome.sidePanel.open({ windowId: w.id }); });
    await panel.waitForTimeout(1500);
    evidence.nativePanelTargets = (await cdp.send("Target.getTargets")).targetInfos.filter((t) => !targetsBefore.targetInfos.some((before) => before.targetId === t.targetId)).map(({ type, url }) => ({ type, url: url.split("?")[0] }));
    const native = context.pages().find((p) => p !== panel && p !== direct && p.url().endsWith("/sidepanel.html"));
    if (native) {
      await native.frameLocator("#deepseek-frame").locator("body").waitFor({ state: "visible", timeout: 15000 });
      const frame = native.frames().find((f) => f.url().startsWith("https://chat.deepseek.com/"));
      evidence.nativePanel = {
        url: frame?.url(), title: await frame?.title(),
        bodyText: await frame?.locator("body").innerText().then((s) => s.slice(0, 500)),
      };
      await native.screenshot({ path: join(artifacts, "real-native-sidebar.png") });
    }
  } catch (error) { evidence.nativePanelError = error.message; }
} catch (error) { evidence.errors.push(error.message); }
finally {
  await writeFile(join(artifacts, "live-site.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  console.log("Evidence:", artifacts);
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
