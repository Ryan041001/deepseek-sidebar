# DeepSeek 官网侧边栏

这个 Chrome 扩展只把 **https://chat.deepseek.com/** 放进原生侧边栏。

**侧边栏整块区域都是 DeepSeek 官方网页**：没有自制聊天界面、工具栏、状态栏、按钮、输入框或欢迎页。Chrome 自带的侧栏标题栏和关闭按钮仍由浏览器管理。插件所需的本地页面仅是不可见的全尺寸 iframe 容器。

不使用第三方聊天服务、不调用 AI API、不需要 API Key。

## 安装

Chrome 116 或以上：

1. 打开 `chrome://extensions/`，开启右上角「开发者模式」。
2. 点「加载已解压的扩展程序」，选择含 `manifest.json` 的 **deepseek-sidebar** 文件夹。
   - 如果使用 ZIP，先解压，再选择解压后的目录；Chrome 不能直接安装这个 ZIP。
3. 在工具栏拼图图标中固定「DeepSeek 小副屏」。
4. 点击插件图标。侧边栏直接打开 DeepSeek 官网，在官网登录并聊天。

无需 npm install。可拖动 Chrome 侧边栏边界调整宽度；左右位置由 Chrome 设置决定。

## 选中文字（可选）

仍保留之前需要的选中文字功能，但不在侧栏加入任何界面：

- 在普通网页选中文字，右键 → **添加到 DeepSeek 输入框（不发送）**。
- 或按 **Alt+Shift+D**（Mac 为 Option+Shift+D）；可以在 `chrome://extensions/shortcuts` 修改快捷键。
- 只追加到**官网原来的输入框**，保留原草稿，用空行分隔；不会点击发送。
- 未登录或输入框尚未出现时，文字在当前浏览器窗口的临时队列等待。最多 20 段，每段最多 60,000 字符，不截断原文。
- 插件图标上的数字表示待添加段数；出现 **!** 时，悬停图标查看错误原因。
- 右键**插件图标**，可「重试添加待添加文字」「清空本窗口待添加文字」，或在普通标签页打开同一个官网。
- 如文字实际已进入草稿、但确认失败，先清空待添加，不要重试，以免重复。

Chrome 内部页面、扩展商店、部分 PDF 或未获授权的 iframe 不能通过脚本读取。嵌入页面里的选中文字优先用右键菜单；快捷键只读取主文档。普通 DeepSeek 顶层标签页不启用输入框桥接。

## 登录与网站限制

登录、聊天界面、历史对话、文件上传和模型选择全部由官网提供。扩展不读取或保存账号密码、Cookie、API Key。

iframe 的登录和 Cookie 行为受网站、Chrome 策略影响，**不保证与普通标签页完全相同**：

- 如果侧栏登录失败，可右键插件图标 →「在标签页打开 DeepSeek 官网」，先在标签页登录，再关闭并重新打开侧栏。
- 若 Chrome 阻止第三方 Cookie，可在确认风险后只为需要的网站设置例外；不要全局关闭浏览器安全功能。部分限制仍可能无法解决。
- 外部身份提供商可能不允许 iframe 登录，请在普通标签页完成。
- 429、403、验证码和网络问题由官网/网络决定，本插件不会绕过。
- 官网改版可能影响选中文字写入；网页侧边栏本身不依赖输入框选择器。
- HTML meta CSP、客户端 frame-busting 或更严格的认证策略仍可能阻止嵌入。

侧栏没有额外刷新按钮。需要重载时可使用浏览器提供的框架重载入口（若可用），或关闭并重新打开侧栏；刷新可能丢失官网未发送的草稿。

## 权限与隐私

| 权限 | 用途 |
| --- | --- |
| `sidePanel` | Chrome 原生侧边栏 |
| `contextMenus` | 选中文字右键入口、插件图标原生右键菜单 |
| `activeTab` + `scripting` | 用户主动操作后临时读取主网页选中文字，不常驻监控所有网页 |
| `storage` | `storage.session` 暂存待添加文字；确认添加、清空、关闭对应窗口或重启浏览器后删除 |
| `https://chat.deepseek.com/*` | 加载唯一官网、向官网原输入框追加文字 |
| `declarativeNetRequestWithHostAccess` | 处理 iframe 嵌入响应头 |

嵌入规则严格匹配：URL 以 `https://chat.deepseek.com/` 开头、请求类型为 `sub_frame`、请求发起者为本扩展 ID。

规则移除该 iframe 响应的 `X-Frame-Options`、`Content-Security-Policy` 和 CSP report-only。Chrome 声明式响应头 API 不能只删除未知 CSP 中的 `frame-ancestors` 指令，因此会移除该响应的整个 CSP；这是允许嵌入的安全取舍，会降低**侧栏内页面**的部分防护。普通 DeepSeek 标签页及其他网站不受此规则影响，扩展自身仍有严格 CSP。

没有统计、广告、远程代码、代理或自建服务器。选中文字只在本地临时排队，追加后官网可观察输入事件或暂存草稿；手动发送后内容会交给 DeepSeek，适用官网自身隐私政策。

## 开发验证

```sh
npm run check
npm test
npm run pack
```

不需要 npm 依赖。打包输出为 `dist/deepseek-sidebar-1.0.0.zip`，只包含运行文件、图标和本说明。

图标重新生成：先安装 Playwright（或通过 `PLAYWRIGHT_MODULE` 指向已有的 Playwright `index.mjs`），再执行 `npm run icons`。`icons/icon.svg` 是图标源文件，扩展运行时使用四种尺寸的 PNG。

`tests/live-site.mjs` 可在独立的测试 profile 中检查真实官网加载和本地存储共享；设置同样的 `PLAYWRIGHT_MODULE` 后运行 `node tests/live-site.mjs`。它不会读取日常浏览器账号、输入登录凭据或发送消息；诊断输出保存在系统临时目录，不进入安装包。真实账号登录后的发消息仍需人工验收。

另有 `tests/browser-smoke.mjs`：需要另行安装 Playwright，并通过 `PLAYWRIGHT_MODULE` 指向其 `index.mjs`。测试使用独立 Chromium profile、本地 HTTPS 模拟站点和本地 CONNECT 代理，验证真实浏览器的 iframe 响应头规则、草稿追加及不发送。其模拟聊天页面**只在测试中出现，不是插件界面**；测试中的证书放宽也仅作用于一次性测试 profile，扩展不代理或放宽实际浏览器设置。

自动化不等于真实官网登录实测。加载后请验收：

- [ ] 侧栏内容区只有官方网页，没有插件自制栏或输入框。
- [ ] 官网能登录、显示历史对话，手动发送正常。
- [ ] 主网页选中文字，右键添加，保留原草稿且不自动发送。
- [ ] 中文、多行、连续多段不遗漏；未登录时队列保留。
- [ ] 不同窗口的待添加队列互不混用。
- [ ] 重试、清空、禁止读取页面时的错误提示正常。

本工具与 DeepSeek 无隶属关系，不是官方扩展。图标使用用户提供的 `icons/icon.svg`，并转换为 Chrome 要求的 PNG 尺寸；图标包含品牌标识，不代表官方授权或隶属关系。
