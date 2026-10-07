import test from "node:test";
import assert from "node:assert/strict";

let sequence = 0;
function event() {
  const listeners = [];
  return { addListener(fn) { listeners.push(fn); }, emit(...args) { for (const fn of listeners) fn(...args); } };
}
async function flush() {
  for (let i = 0; i < 8; i++) await new Promise((done) => setImmediate(done));
}
async function fixture() {
  const data = {};
  const opened = [];
  const menus = [];
  const calls = [];
  const id = "test-extension-id";
  let selection = "选择的文字";
  let denyScripts = false;
  const chrome = {
    runtime: { id, getURL: (path) => `chrome-extension://${id}/${path}`, onInstalled: event(), onConnect: event() },
    storage: { session: {
      async get(key) { return structuredClone({ [key]: data[key] }); },
      async set(values) { Object.assign(data, structuredClone(values)); },
    } },
    declarativeNetRequest: { async updateDynamicRules(rules) { calls.push({ rules }); } },
    sidePanel: {
      async setPanelBehavior(options) { calls.push({ behavior: options }); },
      async setOptions(options) { calls.push({ panelOptions: options }); },
      open({ windowId }) { opened.push(windowId); calls.push({ open: windowId }); return Promise.resolve(); },
    },
    action: { async setBadgeBackgroundColor() {}, async setBadgeText({ text }) { calls.push({ badge: text }); }, async setTitle({ title }) { calls.push({ title }); } },
    contextMenus: { async removeAll() { menus.length = 0; }, create(menu) { menus.push(menu); }, onClicked: event() },
    commands: { onCommand: event() },
    tabs: { async create(options) { calls.push({ newTab: options }); } },
    scripting: { async executeScript(options) {
      calls.push({ script: options });
      if (denyScripts) throw new Error("No access");
      return [{ frameId: 0, result: selection }];
    } },
    windows: { async get(id) { return { id }; }, onRemoved: event() },
  };
  globalThis.chrome = chrome;
  await import(`../background.js?test=${sequence++}`);
  await flush();
  const state = () => data.deepseekSidebarState ?? { queues: {}, notices: {} };
  function click(text, windowId = 1) {
    chrome.contextMenus.onClicked.emit(
      { menuItemId: "add-selection-to-deepseek", selectionText: text, pageUrl: "https://private.example/" },
      { id: windowId * 10, windowId },
    );
  }
  async function panel(windowId = 1, senderUrl = chrome.runtime.getURL("sidepanel.html")) {
    const messages = [];
    let disconnected = false;
    const port = {
      name: "deepseek-sidebar", sender: { id, url: senderUrl },
      onMessage: event(), onDisconnect: event(),
      postMessage(message) { messages.push(structuredClone(message)); },
      disconnect() { disconnected = true; this.onDisconnect.emit(); },
    };
    chrome.runtime.onConnect.emit(port);
    port.onMessage.emit({ type: "REGISTER", windowId });
    await flush();
    return { port, messages, isDisconnected: () => disconnected };
  }
  return { chrome, calls, opened, menus, click, panel, state,
    selection(value) { selection = value; }, denyScripts() { denyScripts = true; } };
}

test("installs only the intended selection menu and scoped embedding rule", async () => {
  const f = await fixture();
  f.chrome.runtime.onInstalled.emit();
  await flush();
  assert.equal(f.menus.length, 4);
  assert.deepEqual(f.menus.map(({ title }) => title), [
    "deepseek一下",
    "在新标签页打开 DeepSeek",
    "重试添加",
    "清空当前窗口待添加文字",
  ]);
  assert.deepEqual(f.menus[0].contexts, ["selection"]);
  assert(f.menus.slice(1).every((menu) => menu.contexts[0] === "action"));
  assert.equal(f.calls[0].rules.addRules[0].condition.initiatorDomains[0], "test-extension-id");
  assert.deepEqual(f.calls.find((call) => call.behavior).behavior, { openPanelOnActionClick: true });
});

test("concurrent selections are retained in order without saving source URLs", async () => {
  const f = await fixture();
  f.click("  first\nline  ");
  f.click("second");
  await flush();
  assert.deepEqual(f.opened, [1, 1]);
  assert.deepEqual(f.state().queues[1].map(({ text }) => text), ["  first\nline  ", "second"]);
  assert.deepEqual(Object.keys(f.state().queues[1][0]).sort(), ["createdAt", "id", "text"]);
});

test("queue acknowledgement is isolated by window and publication follows storage", async () => {
  const f = await fixture();
  f.click("window one", 1);
  f.click("window two", 2);
  await flush();
  const first = await f.panel(1);
  const second = await f.panel(2);
  assert.equal(first.messages.at(-1).entries[0].text, "window one");
  assert.equal(second.messages.at(-1).entries[0].text, "window two");
  first.port.onMessage.emit({ type: "ACK", id: f.state().queues[1][0].id });
  await flush();
  assert.equal(f.state().queues[1].length, 0);
  assert.equal(f.state().queues[2].length, 1);
  assert.equal(first.messages.at(-1).entries.length, 0);
});

test("website content scripts cannot connect to or acknowledge the selection queue", async () => {
  const f = await fixture();
  f.click("private draft");
  await flush();
  const unauthorized = await f.panel(1, "https://chat.deepseek.com/");
  assert.equal(unauthorized.isDisconnected(), true);
  assert.equal(unauthorized.messages.length, 0);
  assert.equal(f.state().queues[1].length, 1);
});

test("shortcut opens panel before asynchronous selection reading", async () => {
  const f = await fixture();
  f.selection("快捷键原文");
  f.chrome.commands.onCommand.emit("add-selection", { id: 123, windowId: 3, url: "https://example.com/" });
  await flush();
  const userCalls = f.calls.filter((call) => call.open || call.script);
  assert.equal(userCalls[0].open, 3);
  assert.equal(userCalls[1].script.target.tabId, 123);
  assert.equal(f.state().queues[3][0].text, "快捷键原文");

  await f.panel(3);
  f.selection("侧栏已打开时添加");
  f.chrome.commands.onCommand.emit("add-selection", { id: 123, windowId: 3, url: "https://example.com/" });
  await flush();
  assert.deepEqual(f.state().queues[3].map(({ text }) => text), ["快捷键原文", "侧栏已打开时添加"]);
  assert.equal(f.calls.some((call) => call.panelOptions), false);
});

test("shortcut toggles the panel without adding anything when there is no selection", async () => {
  const f = await fixture();
  f.selection("");
  const tab = { id: 123, windowId: 3, url: "https://example.com/" };

  f.chrome.commands.onCommand.emit("add-selection", tab);
  await flush();
  assert.deepEqual(f.opened, [3]);
  assert.equal(f.state().queues[3], undefined);
  assert.equal(f.state().notices[3], undefined);
  assert.equal(f.calls.some((call) => call.panelOptions), false);

  await f.panel(3);
  f.chrome.commands.onCommand.emit("add-selection", tab);
  await flush();
  assert.equal(f.state().queues[3], undefined);
  assert.deepEqual(f.calls.filter((call) => call.panelOptions).map(({ panelOptions }) => panelOptions), [
    { tabId: 123, enabled: false },
    { tabId: 123, enabled: true },
  ]);
});

test("denied selection access becomes an actionable notice, not a dropped queue", async () => {
  const f = await fixture();
  f.click("existing");
  await flush();
  f.denyScripts();
  f.chrome.commands.onCommand.emit("add-selection", { id: 10, windowId: 1, url: "https://example.com/" });
  await flush();
  assert.match(f.state().notices[1], /右键菜单/);
  assert.equal(f.state().queues[1][0].text, "existing");
});

test("overflow never silently discards existing queued selections", async () => {
  const f = await fixture();
  for (let i = 0; i < 21; i++) f.click(`entry-${i}`);
  await flush();
  assert.equal(f.state().queues[1].length, 20);
  assert.equal(f.state().queues[1][0].text, "entry-0");
  assert.equal(f.state().queues[1].at(-1).text, "entry-19");
  assert.match(f.state().notices[1], /20/);
});

test("clearing a queue and closing a window delete only that window's data", async () => {
  const f = await fixture();
  f.click("one", 1);
  f.click("two", 2);
  await flush();
  f.chrome.contextMenus.onClicked.emit({ menuItemId: "clear-deepseek-queue" }, { windowId: 1 });
  await flush();
  assert.equal(f.state().queues[1], undefined);
  assert.equal(f.state().queues[2].length, 1);
  f.chrome.windows.onRemoved.emit(2);
  await flush();
  assert.equal(f.state().queues[2], undefined);
  delete globalThis.chrome;
});
