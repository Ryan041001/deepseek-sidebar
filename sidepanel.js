import { DEEPSEEK_URL } from "./shared.js";

// There is intentionally no extension UI: this page is only a full-size iframe.
const NAMESPACE = "deepseek-sidebar-v1";
const frame = document.querySelector("#deepseek-frame");
const { id: windowId } = await chrome.windows.getCurrent();
const token = crypto.randomUUID();

let port;
let entries = [];
let bridgeReady = false;
let editorAvailable = false;
let inFlight;
let paused = false;
let bridgeTimer;
let pingTimer;

function sendToFrame(message) {
  frame.contentWindow?.postMessage({ namespace: NAMESPACE, token, ...message }, "https://chat.deepseek.com");
}

function pause(error) {
  paused = true;
  // Errors are surfaced on Chrome's extension icon, never inside the sidebar.
  port?.postMessage({ type: "ERROR", error });
}

function pingBridge() {
  clearInterval(pingTimer);
  sendToFrame({ type: "PING" });
  // document_idle injection may happen after the iframe's load event.
  pingTimer = setInterval(() => {
    if (bridgeReady) clearInterval(pingTimer);
    else sendToFrame({ type: "PING" });
  }, 500);
}

function deliver() {
  if (!port || !editorAvailable || inFlight || paused || !entries.length) return;
  const entry = entries[0];
  inFlight = { id: entry.id, awaitingStorage: false };
  sendToFrame({ type: "APPEND", id: entry.id, text: entry.text });
  bridgeTimer = setTimeout(() => {
    if (!inFlight || inFlight.id !== entry.id) return;
    inFlight = undefined;
    pause("未收到添加确认。请检查官网草稿：若文字已出现，请右键插件图标清空待添加；否则选择重试添加。");
  }, 6000);
}

function connect() {
  port = chrome.runtime.connect({ name: "deepseek-sidebar" });
  port.onMessage.addListener((message) => {
    if (message.type === "RETRY") {
      paused = false;
      sendToFrame({ type: "PING" });
      deliver();
      return;
    }
    if (message.type !== "STATE") return;
    entries = message.entries;
    if (inFlight && !entries.some(({ id }) => id === inFlight.id)) {
      clearTimeout(bridgeTimer);
      inFlight = undefined;
    }
    if (!entries.length) paused = false;
    deliver();
  });
  port.onDisconnect.addListener(() => {
    port = undefined;
    setTimeout(connect, 500);
  });
  port.postMessage({ type: "REGISTER", windowId });
}

window.addEventListener("message", (event) => {
  if (event.origin !== "https://chat.deepseek.com" ||
      event.source !== frame.contentWindow ||
      event.data?.namespace !== NAMESPACE ||
      event.data.token !== token) return;
  const message = event.data;
  if (message.type === "READY") {
    bridgeReady = true;
    editorAvailable = message.editorAvailable === true;
    deliver();
  } else if (message.type === "APPEND_RESULT" && inFlight?.id === message.id) {
    if (message.ok) {
      inFlight.awaitingStorage = true;
      port?.postMessage({ type: "ACK", id: message.id });
    } else {
      clearTimeout(bridgeTimer);
      inFlight = undefined;
      pause(message.error || "无法写入官网输入框。待添加文字保留，可从插件图标右键菜单重试或清空。");
    }
  }
});

frame.addEventListener("load", () => {
  bridgeReady = false;
  editorAvailable = false;
  if (inFlight) {
    clearTimeout(bridgeTimer);
    inFlight = undefined;
    pause("官网在添加过程中发生跳转。请先检查草稿，再从插件图标右键菜单重试或清空，避免重复添加。");
  }
  pingBridge();
});

connect();
frame.src = DEEPSEEK_URL;
pingBridge();
