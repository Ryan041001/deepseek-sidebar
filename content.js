(() => {
  // Ordinary DeepSeek tabs are untouched: the bridge runs only inside our panel.
  if (window.parent === window) return;
  const NAMESPACE = "deepseek-sidebar-v1";
  const extensionOrigin = chrome.runtime.getURL("").replace(/\/$/, "");
  const completed = new Set();
  let token;
  let lastAvailable;
  let observerTimer;
  let writes = Promise.resolve();

  function isUsable(element) {
    return element && !element.disabled && !element.readOnly &&
      element.getAttribute("aria-disabled") !== "true" &&
      !element.closest('[role="dialog"], [aria-modal="true"]') &&
      element.getClientRects().length > 0;
  }

  function findEditor() {
    const preferred = [
      "textarea#chat-input",
      'textarea[placeholder*="DeepSeek"]',
      'textarea[placeholder*="发送"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="message"]',
      '[contenteditable="true"][role="textbox"]',
    ];
    for (const selector of preferred) {
      const match = [...document.querySelectorAll(selector)].find(isUsable);
      if (match) return match;
    }
    // Avoid accidentally writing into an unrelated editor when several exist.
    const candidates = [...document.querySelectorAll('textarea, [contenteditable="true"]')].filter(isUsable);
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  function reply(message) {
    if (token) window.parent.postMessage({ namespace: NAMESPACE, token, ...message }, extensionOrigin);
  }

  function reportReady(force = false) {
    const available = Boolean(findEditor());
    if (force || available !== lastAvailable) {
      lastAvailable = available;
      reply({ type: "READY", editorAvailable: available });
    }
  }

  function joinDraft(existing, text) {
    const separator = !existing || existing.endsWith("\n\n") ? "" :
      existing.endsWith("\n") ? "\n" : "\n\n";
    return existing + separator + text;
  }

  async function append(entry) {
    if (completed.has(entry.id)) {
      reply({ type: "APPEND_RESULT", id: entry.id, ok: true });
      return;
    }
    try {
      if (typeof entry.id !== "string" || typeof entry.text !== "string" ||
          !entry.text.trim() || entry.text.length > 60000) {
        throw new Error("待添加文字格式不正确。");
      }
      const editor = findEditor();
      if (!editor) throw new Error("未找到 DeepSeek 输入框，请先在侧栏登录并打开对话。");
      editor.focus();
      let expected;
      if (editor instanceof HTMLTextAreaElement) {
        expected = joinDraft(editor.value, entry.text);
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        setter.call(editor, expected);
        editor.dispatchEvent(new InputEvent("input", {
          bubbles: true, inputType: "insertText", data: entry.text,
        }));
        editor.setSelectionRange(expected.length, expected.length);
      } else {
        const existing = editor.innerText ?? editor.textContent ?? "";
        expected = joinDraft(existing, entry.text);
        const suffix = expected.slice(existing.length);
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        if (!document.execCommand("insertText", false, suffix)) {
          throw new Error("无法向此输入框添加文字，请手动粘贴。");
        }
      }
      // Allow controlled components to rerender, then check that the draft stuck.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const actual = editor instanceof HTMLTextAreaElement
        ? editor.value : (editor.innerText ?? editor.textContent ?? "");
      // contenteditable may represent inserted line breaks with block elements,
      // adding a presentation-only blank line to innerText. Do not overwrite its DOM.
      const normalizeRichText = (value) => value.replace(/\r\n?/g, "\n").replace(/\n{2,}/g, "\n\n");
      const retained = editor instanceof HTMLTextAreaElement
        ? actual === expected : normalizeRichText(actual) === normalizeRichText(expected);
      if (!retained) {
        throw new Error("输入框未保留添加的文字，请检查后重试。");
      }
      completed.add(entry.id);
      if (completed.size > 100) completed.delete(completed.values().next().value);
      reply({ type: "APPEND_RESULT", id: entry.id, ok: true });
      reportReady();
    } catch (error) {
      reply({ type: "APPEND_RESULT", id: entry.id, ok: false, error: error.message });
      reportReady(true);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== extensionOrigin ||
        event.data?.namespace !== NAMESPACE ||
        typeof event.data.token !== "string") return;
    if (event.data.type === "PING") {
      token = event.data.token;
      reportReady(true);
    } else if (event.data.type === "APPEND" && event.data.token === token) {
      const entry = event.data;
      writes = writes.then(() => append(entry)).catch(() => {});
    }
  });

  const observer = new MutationObserver(() => {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(() => reportReady(), 150);
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["disabled", "readonly", "aria-disabled", "style", "class"],
  });
})();
