import test from "node:test";
import assert from "node:assert/strict";
import { createEmbedRule, normalizeSelection, readActiveSelection } from "../shared.js";

test("selection validation preserves text and rejects empty/oversized input", () => {
  assert.equal(normalizeSelection("  第一段\n第二段  "), "  第一段\n第二段  ");
  assert.throws(() => normalizeSelection(" \n "), /先/);
  assert.throws(() => normalizeSelection(null), /先/);
  assert.equal(normalizeSelection("x".repeat(60000)).length, 60000);
  assert.throws(() => normalizeSelection("x".repeat(60001)), /60,000/);
});

test("embedding rule is limited to our extension's exact HTTPS subframe", () => {
  const rule = createEmbedRule("test-extension-id");
  assert.deepEqual(rule.condition, {
    urlFilter: "|https://chat.deepseek.com/",
    initiatorDomains: ["test-extension-id"],
    resourceTypes: ["sub_frame"],
  });
  assert.equal(rule.action.type, "modifyHeaders");
  assert(rule.action.responseHeaders.every((header) => header.operation === "remove"));
});

test("selection reader handles text inputs but never password input", () => {
  globalThis.window = { getSelection: () => ({ toString: () => "" }) };
  globalThis.document = {
    activeElement: { tagName: "INPUT", type: "text", value: "abcde", selectionStart: 1, selectionEnd: 4 },
  };
  assert.equal(readActiveSelection(), "bcd");
  document.activeElement.type = "password";
  assert.equal(readActiveSelection(), "");
  document.activeElement = null;
  window.getSelection = () => ({ toString: () => "选中的网页文字" });
  assert.equal(readActiveSelection(), "选中的网页文字");
  delete globalThis.window;
  delete globalThis.document;
});
