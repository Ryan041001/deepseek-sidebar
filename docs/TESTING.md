# 测试与发布验证

## 当前验证状态

当前版本已在 Chrome 中完成实际使用测试：

- 官网在原生侧栏中正常显示。
- 官网账号登录与消息发送、接收正常。
- 选中文字可进入官网原输入框，保留草稿且不自动发送。

以上结论来自实际 Chrome 使用测试。下文的模拟测试用于验证扩展行为，不能代替真实账号的登录与聊天测试。测试尚未覆盖所有浏览器、企业策略、网络环境和官网功能。

## 基础检查

要求 Node.js 22+、Python 3 与 Git。项目根目录执行：

```sh
npm run check
npm test
npm run audit:source
npm run pack
```

这些命令无需 npm 依赖：

- `check`：Manifest、权限边界、资源、语法、版本及纯 iframe 布局。
- `test`：选择校验、菜单、队列隔离、并发、确认删除、来源校验、草稿追加、去重和失败路径。
- `audit:source`：检查受版本控制的文件中常见本机主目录路径和凭据模式，不能替代完整的凭据泄露检查或安全审计。
- `pack`：白名单打包运行资源和公开文档，不包含测试、依赖、profile 或诊断产物。

## Chromium 集成测试

需要 OpenSSL 和 Playwright。可单独安装开发工具，不会给扩展引入运行时依赖：

```sh
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install chromium
npm run test:browser
```

Linux CI 可用 `npx playwright install --with-deps chromium` 安装浏览器系统依赖。也可设置 `PLAYWRIGHT_MODULE`，指向已有 Playwright 的 `index.mjs`。

测试使用一次性的独立 Chromium profile，以及本地 HTTPS 模拟站点与 CONNECT 代理。它验证：

- 内容区只有覆盖整个区域的 iframe；
- 响应头规则允许本扩展嵌入，但不允许无关网站嵌入；
- 输入框未出现时队列保留；
- 多段草稿按序追加，不触发提交；
- textarea 与 contenteditable 两种路径。

证书验证放宽只作用于该一次性模拟测试 profile。模拟页面、代理与证书均不属于扩展运行功能。不要用日常浏览器 profile 运行测试。

## 可选真实站点诊断

```sh
npm run test:live
```

这个脚本检查官网加载、侧栏地址和测试用存储数据，不填写凭据、登录账号或发送消息。官网状态和网络环境可能影响结果，因此未将它设为 CI 必须通过的检查。

真实网页可能通过第三方登录组件显示身份信息。诊断 JSON、日志与截图一律保存在系统临时目录或显式指定的 `BROWSER_ARTIFACT_DIR` 中；不要未经审查上传，即使 profile 是新建的。

## 图标

图标按用途分为两组；每组都有 16、32、48、128 四种 PNG，供 Chrome 使用：

| 预览 | 源文件 | 用途 |
| --- | --- | --- |
| <img src="../icons/icon.svg" width="40" height="40" alt="小鲸鱼项目图标"> | `icons/icon.svg` | README 项目标识、打开侧栏的工具栏按钮（`action.default_icon`）、使用指南入口 |
| <img src="../icons/sidebar.svg" width="40" height="40" alt="简洁侧边栏图标"> | `icons/sidebar.svg` | 扩展管理页与浏览器原生侧栏标题的扩展标识（`manifest.icons`） |

修改对应 SVG 后，安装 Playwright 并运行以下命令，同时更新两组 PNG：

```sh
npm run icons
```

也可以通过 `PLAYWRIGHT_MODULE` 指定已有的 Playwright 模块，通过 `PLAYWRIGHT_EXECUTABLE_PATH` 指定已有的 Chromium 可执行文件。

小鲸鱼项目图标含第三方品牌元素，见 [NOTICE](../NOTICE.md)。简洁侧边栏图标由项目绘制，不含鲸鱼品牌图形。重新品牌化时应替换含品牌元素的 SVG 并生成 PNG。

## 发布清单

- 运行上述静态、单元与浏览器测试。
- 在实际 Chrome 中复核登录、消息发送/接收与选中文字。
- 确认 Manifest 与 package 版本一致，更新 Changelog。
- 审查 Git 差异及 Release ZIP，移除个人信息与凭据。
- 将 ZIP 附加到与提交对应的版本标签，保留 LICENSE 和 NOTICE。
- 不上传测试截图、浏览器数据、安装依赖或机器配置。
