import {
  MAX_QUEUE_LENGTH, STATE_KEY, MENU_ID, normalizeSelection,
  createEmbedRule, readActiveSelection, DEEPSEEK_URL,
} from "./shared.js";

const panelPorts = new Map();
let mutation = Promise.resolve();

function serialized(task) {
  const result = mutation.then(task);
  mutation = result.catch(() => {});
  return result;
}

async function getState() {
  const stored = (await chrome.storage.session.get(STATE_KEY))[STATE_KEY];
  return stored ?? { queues: {}, notices: {} };
}

function post(port, message) {
  try { port.postMessage(message); } catch { /* Disconnected panel. */ }
}

async function publish(windowId, state) {
  for (const port of panelPorts.get(windowId) ?? []) {
    post(port, {
      type: "STATE",
      entries: state.queues[windowId] ?? [],
      notice: state.notices[windowId] ?? "",
    });
  }
  const count = Object.values(state.queues).reduce((total, entries) => total + entries.length, 0);
  const error = Object.values(state.notices).find(Boolean);
  await chrome.action.setBadgeBackgroundColor({ color: error ? "#d88421" : "#4d6bfe" });
  await chrome.action.setBadgeText({ text: error ? "!" : count ? String(count) : "" });
  await chrome.action.setTitle({
    title: error ? "DeepSeek 小副屏：" + error :
      count ? "DeepSeek 小副屏：" + count + " 段文字待添加，请在官网登录 / 打开对话" :
      "打开 DeepSeek 小副屏",
  });
}

function changeState(windowId, update) {
  return serialized(async () => {
    const state = await getState();
    update(state);
    await chrome.storage.session.set({ [STATE_KEY]: state });
    await publish(windowId, state);
  });
}

async function reportError(windowId, error) {
  console.warn("[DeepSeek 小副屏]", error);
  if (!Number.isInteger(windowId)) return;
  await changeState(windowId, (state) => {
    state.notices[windowId] = error?.message || "操作失败，请重试。";
  });
}

function openPanel(windowId) {
  // Called directly from the user gesture, before any awaited work.
  return chrome.sidePanel.open({ windowId });
}

async function enqueue(windowId, selection) {
  const text = normalizeSelection(selection);
  await changeState(windowId, (state) => {
    const entries = state.queues[windowId] ?? [];
    if (entries.length >= MAX_QUEUE_LENGTH) {
      throw new Error("已有 20 段文字等待添加，请先完成登录或清空队列。");
    }
    state.queues[windowId] = [
      ...entries,
      { id: crypto.randomUUID(), text, createdAt: Date.now() },
    ];
    delete state.notices[windowId];
  });
}

async function addTabSelection(tab, windowId) {
  if (!Number.isInteger(tab?.id) || !/^https?:/.test(tab.url ?? "")) {
    throw new Error("此页面不允许读取选中文字。请在普通网页使用右键菜单或快捷键。");
  }
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readActiveSelection,
    });
  } catch {
    throw new Error("当前网页未授权或禁止脚本访问。请选中文字后使用右键菜单，或按 Alt+Shift+D；无需授予所有网站权限。");
  }
  const selection = results.map(({ result }) => result).find((text) => text?.trim());
  await enqueue(windowId, selection);
}

async function configure() {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [createEmbedRule(chrome.runtime.id)],
  });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

const configured = configure().catch((error) => {
  console.error("[DeepSeek 小副屏] 初始化失败", error);
});

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    await configured;
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: MENU_ID, title: "添加到 DeepSeek 输入框（不发送）", contexts: ["selection"],
    });
    for (const [id, title] of [
      ["open-deepseek-tab", "在标签页打开 DeepSeek 官网"],
      ["retry-deepseek-queue", "重试添加待添加文字"],
      ["clear-deepseek-queue", "清空本窗口待添加文字"],
    ]) chrome.contextMenus.create({ id, title, contexts: ["action"] });
  })().catch(console.error);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!Number.isInteger(tab?.windowId)) return;
  const windowId = tab.windowId;
  if (info.menuItemId === MENU_ID) {
    const opening = openPanel(windowId);
    void Promise.all([opening, enqueue(windowId, info.selectionText)])
      .catch((error) => reportError(windowId, error)).catch(console.error);
  } else if (info.menuItemId === "open-deepseek-tab") {
    void chrome.tabs.create({ url: DEEPSEEK_URL }).catch(console.error);
  } else if (info.menuItemId === "clear-deepseek-queue") {
    void changeState(windowId, (state) => {
      delete state.queues[windowId];
      delete state.notices[windowId];
    }).catch(console.error);
  } else if (info.menuItemId === "retry-deepseek-queue") {
    const opening = openPanel(windowId);
    void Promise.all([opening, changeState(windowId, (state) => {
      delete state.notices[windowId];
    })]).then(() => {
      for (const port of panelPorts.get(windowId) ?? []) post(port, { type: "RETRY" });
    }).catch((error) => reportError(windowId, error)).catch(console.error);
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "add-selection" || !Number.isInteger(tab?.windowId)) return;
  const opening = openPanel(tab.windowId);
  void Promise.all([opening, addTabSelection(tab, tab.windowId)])
    .catch((error) => reportError(tab.windowId, error))
    .catch(console.error);
});

chrome.runtime.onConnect.addListener((port) => {
  // Only our sidepanel may read/acknowledge the selection queue.
  if (port.name !== "deepseek-sidebar" ||
      port.sender?.id !== chrome.runtime.id ||
      port.sender?.url !== chrome.runtime.getURL("sidepanel.html")) {
    port.disconnect();
    return;
  }
  let windowId;
  port.onDisconnect.addListener(() => {
    if (windowId !== undefined) {
      const ports = panelPorts.get(windowId);
      ports?.delete(port);
      if (!ports?.size) panelPorts.delete(windowId);
    }
  });
  port.onMessage.addListener((message) => {
    void (async () => {
      if (message.type === "REGISTER") {
        if (windowId !== undefined || !Number.isInteger(message.windowId)) return;
        await chrome.windows.get(message.windowId);
        windowId = message.windowId;
        const ports = panelPorts.get(windowId) ?? new Set();
        ports.add(port);
        panelPorts.set(windowId, ports);
        await serialized(async () => publish(windowId, await getState()));
        return;
      }
      if (windowId === undefined) return;
      if (message.type === "ACK") {
        await changeState(windowId, (state) => {
          const entries = state.queues[windowId] ?? [];
          state.queues[windowId] = entries.filter(({ id }) => id !== message.id);
          delete state.notices[windowId];
        });
      } else if (message.type === "ERROR") {
        await reportError(windowId, new Error(String(message.error || "添加失败。").slice(0, 512)));
      }
    })().catch((error) => reportError(windowId, error)).catch(console.error);
  });
});

chrome.windows.onRemoved.addListener((windowId) => {
  panelPorts.delete(windowId);
  void changeState(windowId, (state) => {
    delete state.queues[windowId];
    delete state.notices[windowId];
  }).catch(console.error);
});
