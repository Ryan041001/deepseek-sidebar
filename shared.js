export const DEEPSEEK_URL = "https://chat.deepseek.com/";
export const MAX_SELECTION_LENGTH = 60_000;
export const MAX_QUEUE_LENGTH = 20;
export const STATE_KEY = "deepseekSidebarState";
export const MENU_ID = "add-selection-to-deepseek";

export function normalizeSelection(value) {
  const text = typeof value === "string" ? value : "";
  if (!text.trim()) throw new Error("请先在网页中选中文字。");
  if (text.length > MAX_SELECTION_LENGTH) {
    throw new Error("选中文字超过 60,000 字符，请分段添加。");
  }
  return text;
}

export function createEmbedRule(extensionId) {
  return {
    id: 1,
    priority: 1,
    action: {
      type: "modifyHeaders",
      responseHeaders: [
        { header: "x-frame-options", operation: "remove" },
        { header: "content-security-policy", operation: "remove" },
        { header: "content-security-policy-report-only", operation: "remove" },
      ],
    },
    condition: {
      urlFilter: "|https://chat.deepseek.com/",
      initiatorDomains: [extensionId],
      resourceTypes: ["sub_frame"],
    },
  };
}

// Passed to executeScript: must not depend on module variables.
export function readActiveSelection() {
  const selection = window.getSelection()?.toString();
  if (selection?.trim()) return selection;
  const active = document.activeElement;
  if (active && ["TEXTAREA", "INPUT"].includes(active.tagName)) {
    if (active.tagName === "INPUT" &&
        !["text", "search", "url", "email", "tel"].includes(active.type)) {
      return ""; // Never copy passwords or other sensitive input types.
    }
    if (typeof active.selectionStart === "number" &&
        typeof active.selectionEnd === "number") {
      return active.value.slice(active.selectionStart, active.selectionEnd);
    }
  }
  return "";
}
