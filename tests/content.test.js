import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../content.js", import.meta.url), "utf8");
const origin = "chrome-extension://test-extension-id";
const namespace = "deepseek-sidebar-v1";

function fixture({ embedded = true, existing = "", usable = true, revert = false } = {}) {
  const responses = [];
  const events = [];
  const handlers = {};
  class Textarea {
    #value = existing;
    get value() { return this.#value; }
    set value(value) { this.#value = value; }
    getAttribute() { return null; }
    closest() { return null; }
    getClientRects() { return usable ? [{}] : []; }
    focus() { this.focused = true; }
    setSelectionRange(start, end) { this.caret = [start, end]; }
    dispatchEvent(event) {
      events.push(event);
      if (revert) this.value = existing;
    }
  }
  const editor = new Textarea();
  const parent = { postMessage(message, target) { responses.push({ message, target }); } };
  const window = { parent, addEventListener(type, fn) { handlers[type] = fn; } };
  if (!embedded) window.parent = window;
  const context = {
    window,
    chrome: { runtime: { getURL: () => origin + "/" } },
    document: {
      documentElement: {},
      querySelectorAll: (selector) => selector === "textarea#chat-input" ? [editor] : [],
    },
    HTMLTextAreaElement: Textarea,
    InputEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    MutationObserver: class { observe() {} },
    requestAnimationFrame: (fn) => queueMicrotask(fn),
    setTimeout, clearTimeout, console,
  };
  vm.runInNewContext(source, context);
  async function message(data, senderOrigin = origin, sender = parent) {
    handlers.message?.({ data: { namespace, token: "test-token", ...data }, origin: senderOrigin, source: sender });
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { editor, responses, events, message, handlers, parent };
}

test("regular DeepSeek tabs do not install a bridge", () => {
  const f = fixture({ embedded: false });
  assert.equal(f.handlers.message, undefined);
});

test("untrusted sources and origins cannot write into the composer", async () => {
  const f = fixture();
  await f.message({ type: "PING" }, "https://evil.example");
  await f.message({ type: "PING" }, origin, {});
  await f.message({ type: "APPEND", id: "1", text: "bad" });
  assert.equal(f.responses.length, 0);
  assert.equal(f.editor.value, "");
});

test("append preserves draft and multiline text, without any submit event", async () => {
  const f = fixture({ existing: "原有草稿" });
  await f.message({ type: "PING" });
  assert.equal(f.responses[0].message.editorAvailable, true);
  await f.message({ type: "APPEND", id: "1", text: "第一行\n第二行" });
  assert.equal(f.editor.value, "原有草稿\n\n第一行\n第二行");
  assert.deepEqual(f.events.map(({ type }) => type), ["input"]);
  assert(f.responses.some(({ message }) => message.type === "APPEND_RESULT" && message.ok));
  assert(f.responses.every(({ target }) => target === origin));
});

test("repeated delivery is idempotent within the same document", async () => {
  const f = fixture();
  await f.message({ type: "PING" });
  await f.message({ type: "APPEND", id: "same", text: "一次" });
  await f.message({ type: "APPEND", id: "same", text: "一次" });
  assert.equal(f.editor.value, "一次");
  assert.equal(f.events.length, 1);
});

test("existing blank lines are preserved rather than removed", async () => {
  const f = fixture({ existing: "草稿\n\n" });
  await f.message({ type: "PING" });
  await f.message({ type: "APPEND", id: "1", text: "新文字" });
  assert.equal(f.editor.value, "草稿\n\n新文字");
});

test("missing editor returns a failure, never a successful acknowledgement", async () => {
  const f = fixture({ usable: false });
  await f.message({ type: "PING" });
  await f.message({ type: "APPEND", id: "1", text: "保留在队列" });
  const result = f.responses.find(({ message }) => message.type === "APPEND_RESULT").message;
  assert.equal(result.ok, false);
  assert.match(result.error, /未找到/);
});

test("controlled component reverting the value returns a failure", async () => {
  const f = fixture({ existing: "original", revert: true });
  await f.message({ type: "PING" });
  await f.message({ type: "APPEND", id: "1", text: "text" });
  const result = f.responses.find(({ message }) => message.type === "APPEND_RESULT").message;
  assert.equal(result.ok, false);
  assert.match(result.error, /未保留/);
});
