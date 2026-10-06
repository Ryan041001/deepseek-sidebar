// Optional Chromium smoke test, with a mocked website (no real login or chats).
// npm run test:browser (install Playwright first, or set PLAYWRIGHT_MODULE).
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import https from "node:https";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const profile = await mkdtemp(join(tmpdir(), "deepseek-sidebar-profile-"));
const artifacts = process.env.BROWSER_ARTIFACT_DIR || join(tmpdir(), "deepseek-sidebar-evidence");
await mkdir(artifacts, { recursive: true });
let context;
let httpsServer;
let proxyServer;
let richText = false;
const sockets = new Set();
function mockSite() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
        body{font:14px system-ui;background:#f7f8fb;padding:20px;color:#242936}
        textarea,[contenteditable]{box-sizing:border-box;width:100%;min-height:180px;padding:12px;border:1px solid #ddd;border-radius:12px;font:14px system-ui;white-space:pre-wrap}
        button{padding:10px;background:#4d6bfe;color:white;border:0;border-radius:8px}
        </style></head><body><h2>官网输入框模拟页面</h2><p>仅用于自动化测试，不是真实 DeepSeek 对话。</p>
        <button id="login">模拟登录</button><form id="chat"></form>
        <script>window.submissions=0;window.inputs=0;
        document.querySelector('#chat').addEventListener('submit',e=>{e.preventDefault();window.submissions++});
        document.querySelector('#login').addEventListener('click',()=>{
          document.querySelector('#chat').innerHTML=${JSON.stringify(richText ? '<div contenteditable="true" role="textbox">原有草稿</div>' : '<textarea id="chat-input" placeholder="给 DeepSeek 发送消息">原有草稿</textarea>')};
          document.querySelector('#chat').addEventListener('input',()=>window.inputs++);
          document.querySelector('#login').remove();
        });</script></body></html>`;
}
try {
  // CDP route.fulfill bypasses DNR response processing. Use a local HTTPS
  // fixture behind a CONNECT proxy so Chromium sees real network responses.
  // Certificate relaxation applies ONLY to this disposable mock profile.
  const key = join(profile, "fixture-key.pem");
  const cert = join(profile, "fixture-cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", key, "-out", cert, "-subj", "/CN=chat.deepseek.com"], { stdio: "ignore" });
  httpsServer = https.createServer({ key: await readFile(key), cert: await readFile(cert) }, (request, response) => {
    const host = request.headers.host?.split(":")[0];
    if (host === "chat.deepseek.com") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
        "x-frame-options": "DENY",
        "content-security-policy": "frame-ancestors 'none'; script-src 'unsafe-inline'",
      });
      response.end(mockSite());
    } else if (host === "example.com") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end('<iframe src="https://chat.deepseek.com/"></iframe>');
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((done) => httpsServer.listen(0, "127.0.0.1", done));
  proxyServer = http.createServer((request, response) => { response.writeHead(404); response.end(); });
  proxyServer.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  proxyServer.on("connect", (request, client, head) => {
    const upstream = net.connect(httpsServer.address().port, "127.0.0.1", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.on("error", () => client.destroy());
    client.on("error", () => upstream.destroy());
    client.on("close", () => upstream.destroy());
  });
  await new Promise((done) => proxyServer.listen(0, "127.0.0.1", done));
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, viewport: { width: 400, height: 800 },
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`,
      `--proxy-server=http://127.0.0.1:${proxyServer.address().port}`,
      "--ignore-certificate-errors", "--disable-quic"],
  });
  const isOurWorker = (worker) => worker.url().startsWith("chrome-extension://") && worker.url().endsWith("/background.js");
  const worker = context.serviceWorkers().find(isOurWorker) || await context.waitForEvent("serviceworker", { predicate: isOurWorker });
  console.log("Test extension worker:", worker.url());
  const id = new URL(worker.url()).hostname;
  const browserErrors = [];
  context.on("page", (page) => page.on("pageerror", (error) => browserErrors.push(error.message)));
  let rules = [];
  for (let attempt = 0; attempt < 100 && !rules.length; attempt++) {
    rules = await worker.evaluate(() => chrome.declarativeNetRequest?.getDynamicRules() ?? []);
    if (!rules.length) await new Promise((done) => setTimeout(done, 50));
  }
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].condition.initiatorDomains, [id]);
  const options = await worker.evaluate(() => chrome.sidePanel.getOptions({}));
  assert.equal(options.path, "sidepanel.html");
  const windowId = await worker.evaluate(async () => (await chrome.windows.getCurrent()).id);
  await worker.evaluate(async ({ windowId }) => {
    await chrome.storage.session.set({ deepseekSidebarState: {
      queues: { [windowId]: [
        { id: "first", text: "第一段\n多行文字", createdAt: Date.now() },
        { id: "second", text: "第二段", createdAt: Date.now() },
      ] }, notices: {},
    } });
  }, { windowId });
  const panel = await context.newPage();
  const consoleErrors = [];
  panel.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  const layout = await panel.evaluate(() => ({
    children: Array.from(document.body.children, (node) => node.tagName),
    x: document.querySelector("iframe").getBoundingClientRect().x,
    y: document.querySelector("iframe").getBoundingClientRect().y,
    width: document.querySelector("iframe").getBoundingClientRect().width,
    height: document.querySelector("iframe").getBoundingClientRect().height,
    viewport: [innerWidth, innerHeight],
  }));
  assert.deepEqual(layout.children, ["IFRAME"]);
  assert.equal(layout.x, 0);
  assert.equal(layout.y, 0);
  assert.equal(layout.width, layout.viewport[0]);
  assert.equal(layout.height, layout.viewport[1]);
  console.log("PASS: sidebar has only a full-size website iframe; no custom UI.");
  async function waitForQueue(count) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const queue = await worker.evaluate(async ({ windowId }) =>
        (await chrome.storage.session.get("deepseekSidebarState")).deepseekSidebarState.queues[windowId] ?? [], { windowId });
      if (queue.length === count) return;
      await new Promise((done) => setTimeout(done, 50));
    }
    throw new Error("Queue did not reach expected length " + count);
  }
  const site = panel.frameLocator("#deepseek-frame");
  await site.locator("#login").waitFor({ timeout: 15000 });
  console.log("PASS: extension iframe loads despite DENY/frame-ancestors response headers.");
  let pending = await worker.evaluate(async ({ windowId }) => (await chrome.storage.session.get("deepseekSidebarState")).deepseekSidebarState.queues[windowId], { windowId });
  assert.equal(pending.length, 2);
  console.log("PASS: queue remains intact before the editor is available.");
  await site.locator("#login").click();
  await waitForQueue(0);
  assert.equal(await site.locator("#chat-input").inputValue(), "原有草稿\n\n第一段\n多行文字\n\n第二段");
  const counters = await site.locator("body").evaluate(() => ({ submissions: window.submissions, inputs: window.inputs }));
  assert.deepEqual(counters, { submissions: 0, inputs: 2 });
  pending = await worker.evaluate(async ({ windowId }) => (await chrome.storage.session.get("deepseekSidebarState")).deepseekSidebarState.queues[windowId], { windowId });
  assert.equal(pending.length, 0);
  console.log("PASS: two queued selections append in order, preserve the draft, and never submit.");
  await panel.screenshot({ path: join(artifacts, "iframe-only-mock.png") });

  // Verify the real browser's contenteditable/execCommand bridge as well.
  richText = true;
  await worker.evaluate(async ({ windowId }) => {
    await chrome.storage.session.set({ deepseekSidebarState: {
      queues: { [windowId]: [{ id: "rich", text: "富文本追加", createdAt: Date.now() }] }, notices: {},
    } });
  }, { windowId });
  await panel.reload();
  await site.locator("#login").click();
  await waitForQueue(0);
  const richDraft = await site.locator('[contenteditable="true"]').innerText();
  assert.equal(richDraft.replace(/\n{2,}/g, "\n\n"), "原有草稿\n\n富文本追加");
  console.log("PASS: contenteditable fallback appends using the browser's input path.");

  // The same headers must still block an unrelated website's iframe.
  const outside = await context.newPage();
  const outsideErrors = [];
  outside.on("console", (message) => outsideErrors.push(message.text()));
  await outside.goto("https://example.com/");
  await outside.waitForTimeout(1000);
  assert(outsideErrors.some((text) => /frame-ancestors|X-Frame-Options|Refused to (frame|display)/i.test(text)), JSON.stringify(outsideErrors));
  assert.equal(browserErrors.length, 0, JSON.stringify(browserErrors));
  console.log("PASS: unrelated website iframe remains blocked; no extension page errors.");
  console.log("Mock browser evidence:", artifacts);
} finally {
  await context?.close();
  for (const socket of sockets) socket.destroy();
  proxyServer?.close();
  httpsServer?.closeAllConnections();
  httpsServer?.close();
  await rm(profile, { recursive: true, force: true });
}
