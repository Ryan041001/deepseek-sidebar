// Real Chromium side-panel regression test. No real DeepSeek login or chats.
// The temporary extension adds only a user-gesture driver and fixture host access;
// commands use the production listener, storage, ports and native Side Panel APIs.
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright"));
} catch {
  throw new Error("Install Playwright and Chromium, or set PLAYWRIGHT_MODULE to Playwright's index.mjs.");
}
const root = resolve(import.meta.dirname, "..");
const scratch = await mkdtemp(join(tmpdir(), "deepseek-shortcut-"));
const extension = join(scratch, "extension");
const artifacts = join(root, "browser-evidence", "shortcut-toggle");
const evidence = [];
let context;

async function eventually(check, description) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${description}`);
}

try {
  await cp(root, extension, {
    recursive: true,
    filter: (path) => !/\/(?:\.git|dist|node_modules|browser-evidence)(?:\/|$)/.test(path),
  });
  const manifest = JSON.parse(await readFile(join(extension, "manifest.json"), "utf8"));
  manifest.host_permissions.push("https://shortcut.example/*");
  manifest.content_scripts.push({ matches: ["https://shortcut.example/*"], js: ["shortcut-driver.js"] });
  await writeFile(join(extension, "manifest.json"), JSON.stringify(manifest));
  const background = await readFile(join(extension, "background.js"), "utf8");
  const registration = 'chrome.commands.onCommand.addListener((command, tab) => {';
  assert(background.includes(registration), "Locate the production command listener for the test-only driver.");
  await writeFile(join(extension, "background.js"), background.replace(registration,
    'chrome.commands.onCommand.addListener(globalThis.shortcutForTest = (command, tab) => {') + `
globalThis.hasPanelForTest = windowId => Boolean(panelPorts.get(windowId)?.size);
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "TEST_SHORTCUT" && sender.tab?.url?.startsWith("https://shortcut.example/")) {
    globalThis.shortcutForTest("add-selection", sender.tab);
  }
});
`);
  await writeFile(join(extension, "shortcut-driver.js"), `
const driver = document.createElement("button");
driver.id = "shortcut-driver";
driver.textContent = "Test shortcut";
// Keep text-input focus and document selection, like a keyboard command does.
driver.addEventListener("mousedown", event => event.preventDefault());
driver.addEventListener("click", () => chrome.runtime.sendMessage({ type: "TEST_SHORTCUT" }));
document.body.append(driver);
`);

  context = await chromium.launchPersistentContext(join(scratch, "profile"), {
    channel: "chromium",
    headless: process.env.HEADLESS !== "0",
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  await context.route("https://shortcut.example/**", (route) => route.fulfill({
    contentType: "text/html",
    body: '<p id="selection">selected webpage text</p><textarea id="input">textarea selected text</textarea>',
  }));
  await context.route("https://chat.deepseek.com/**", (route) => route.fulfill({
    contentType: "text/html",
    // No editor: additions stay in the production queue for inspection.
    body: "<p>Mock DeepSeek login page</p>",
  }));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  await eventually(() => worker.evaluate(() => typeof chrome.tabs?.query === "function" &&
    typeof globalThis.hasPanelForTest === "function"), "background script initialization");
  const panelCount = () => worker.evaluate(async () =>
    (await chrome.runtime.getContexts({ contextTypes: ["SIDE_PANEL"] })).length);
  const state = () => worker.evaluate(async () =>
    (await chrome.storage.session.get("deepseekSidebarState")).deepseekSidebarState);
  const waitPanels = (count) => eventually(async () => await panelCount() === count, `${count} actual side panels`);
  const tabFor = (url) => worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0], url);
  const pending = async (windowId) => (await state())?.queues?.[windowId] || [];
  const record = async (scenario) => {
    evidence.push({ scenario, panelCount: await panelCount(), state: await state() });
    console.log(`PASS: ${scenario}`);
  };
  const page = context.pages()[0];
  await page.goto("https://shortcut.example/one");
  const tab = await tabFor(page.url());
  const trigger = async (page) => {
    await page.bringToFront();
    await page.locator("#shortcut-driver").click();
  };
  const clearSelection = (page) => page.evaluate(() => {
    document.activeElement?.blur();
    window.getSelection().removeAllRanges();
  });
  await waitPanels(0);
  await trigger(page);
  await waitPanels(1);
  assert.deepEqual(await pending(tab.windowId), []);
  await record("no selection opens a real panel without adding text");
  // Wait for the real side-panel port to register, not just its renderer creation.
  await eventually(() => worker.evaluate((id) => globalThis.hasPanelForTest(id), tab.windowId), "panel registration");
  await trigger(page);
  await waitPanels(0);
  await record("no selection closes a real window-scoped panel");

  await page.evaluate(() => window.getSelection().selectAllChildren(document.querySelector("#selection")));
  await trigger(page);
  await waitPanels(1);
  await eventually(async () => (await pending(tab.windowId)).length === 1, "selected text queued");
  assert.equal((await pending(tab.windowId))[0].text, "selected webpage text");
  await record("selected text opens the panel and is added once");
  await trigger(page);
  await eventually(async () => (await pending(tab.windowId)).length === 2, "second selected text queued");
  await waitPanels(1);
  await record("selected text adds again without closing an open panel");
  await clearSelection(page);
  await trigger(page);
  await waitPanels(0);
  assert.equal((await pending(tab.windowId)).length, 2);
  await record("no selection closes without changing pending text");

  await page.locator("#input").focus();
  await page.locator("#input").evaluate((input) => input.setSelectionRange(0, 8));
  await trigger(page);
  await waitPanels(1);
  await eventually(async () => (await pending(tab.windowId)).length === 3, "text-input selection queued");
  assert.equal((await pending(tab.windowId))[2].text, "textarea");
  await record("opening preserves the selected text inside a focused textarea");

  assert.equal(await worker.evaluate(() => typeof chrome.sidePanel.close), "function", "Use Chromium 141+ to test native close.");
  // Create through Playwright first so its fixture routing follows the tab.
  const second = await context.newPage();
  await second.goto("https://shortcut.example/two");
  const secondTabId = (await tabFor(second.url())).id;
  await worker.evaluate((tabId) => chrome.windows.create({ tabId, focused: true }), secondTabId);
  const secondTab = await tabFor(second.url());
  assert.notEqual(secondTab.windowId, tab.windowId);
  await trigger(second);
  await waitPanels(2);
  await eventually(() => worker.evaluate((id) => globalThis.hasPanelForTest(id), secondTab.windowId), "second panel registration");
  await clearSelection(page);
  await trigger(page);
  await waitPanels(1);
  await record("native close affects only the command's window");
  await trigger(second);
  await waitPanels(0);

  // Exercise the Chrome 116–140 fallback against the real panel implementation.
  await worker.evaluate(() => { chrome.sidePanel.close = undefined; });
  await trigger(page);
  await waitPanels(1);
  await trigger(page);
  await waitPanels(0);
  await trigger(page);
  await waitPanels(1);
  assert.equal((await pending(tab.windowId)).length, 3);
  await record("legacy global disable/restore closes and allows reopening");
  const result = { chromium: context.browser().version(), scenarios: evidence };
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, "result.json"), JSON.stringify(result, null, 2));
  console.log("Real side-panel evidence:", artifacts);
} finally {
  await context?.close();
  await rm(scratch, { recursive: true, force: true });
}
