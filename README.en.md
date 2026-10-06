<div align="center">

<p align="center">
  <img src="icons/icon.svg" width="88" height="88" alt="DeepSeek Sidebar icon">
</p>

# DeepSeek Sidebar

**Browse the web with DeepSeek alongside.**

Open the official DeepSeek web app in Chrome's native side panel while reading, researching, or writing.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Chrome 116+](https://img.shields.io/badge/Chrome-116%2B-4285F4)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)

[Download](../../releases/latest) · [Privacy](docs/PRIVACY.md) · [Contributing](CONTRIBUTING.md) · [简体中文](README.md)

</div>

---

## Features

DeepSeek Sidebar opens **[chat.deepseek.com](https://chat.deepseek.com/)** in Chrome's native side panel. It uses the website's chat interface and requires no API key. Accounts, models, history, and messaging are handled by the official website.

- **Official web app.** View DeepSeek and the current page side by side.
- **Add selected text.** Use the context menu or a keyboard shortcut to add a selection to the official composer.
- **Keep existing drafts.** Text is appended in order. Review and edit it before sending; the extension does not send messages automatically.
- **Pending selections.** Text is stored locally per window until the composer is ready. Right-click the extension icon to retry or clear it.
- **No extension backend or telemetry.** Zero third-party runtime dependencies, with documented permissions and data flow.

**Testing:** The current release has been tested in Chrome for login, messaging, and adding selected text. Automated tests cover draft preservation, no automatic sending, queue isolation, and embedding rules. See [Testing](docs/TESTING.md) for details.

## Install

Requires **Chrome 116+**; the latest stable version is recommended.

1. Download `deepseek-sidebar-*.zip` from [Releases](../../releases/latest) and extract it.
2. Open `chrome://extensions/` and enable **Developer mode**.
3. Choose **Load unpacked**, then select the directory containing `manifest.json`.
4. Pin **DeepSeek 小副屏** in Chrome's extensions menu.
5. Click the icon and sign in to the official website.

No build step or npm installation is required. Keep the extracted folder in place while Chrome uses it. To update, replace its contents and reload the extension; save any unsent draft first.

## Use

Click the <img src="icons/icon.svg" width="16" height="16" alt="DeepSeek Sidebar icon"> in the toolbar to open the panel. Drag its edge to adjust the width; Chrome settings control which side it appears on.

Select text on a web page, right-click, and choose **添加到 DeepSeek 输入框** (“Add to DeepSeek composer”). Review and edit the text in the composer, then send it yourself.

The default shortcut is **Alt + Shift + D**, or **Option + Shift + D** on macOS. Configure it at `chrome://extensions/shortcuts`. Extension-owned menu labels are currently in Simplified Chinese; the web app controls its own language.

Right-click the extension icon to open the official website in a tab, retry pending additions, or clear the current window's queue. The badge shows pending items; **!** indicates an error available in the icon tooltip.

Each window accepts up to 20 pending selections of up to 60,000 characters each. Clearing the queue does not erase the official draft, and an already dispatched write may still finish. If text is present despite a timeout, clear rather than retry to avoid duplication.

## Privacy and security

The extension does not collect credentials, create user accounts, or run analytics, ads, or a content proxy. Pending text is stored in local session storage. The website may read text once it is added to the composer, even before you send it. DeepSeek's privacy policy applies to that content.

Persistent host access is restricted to `chat.deepseek.com`. Selection reading on other pages requires a user action.

**Embedding security:** The extension removes framing restrictions and CSP response headers from matching official-site subframes initiated by this extension. This weakens some protections for those embedded documents. Ordinary top-level tabs are outside the rule's scope. Review the [full permission and privacy documentation](docs/PRIVACY.md) before use.

Website changes, authentication policies, network restrictions, and browser cookie settings can affect compatibility. This project does not bypass CAPTCHA, rate limits, or access controls. Other Chromium-based browsers have not undergone formal compatibility testing for this project.

## Contribute

For basic development, use Node.js 22+, Python 3, and Git:

```sh
npm run check
npm test
npm run audit:source
npm run pack
```

No npm dependencies are required for these commands. Browser tests have separate setup instructions.

See [Contributing](CONTRIBUTING.md), [Architecture](docs/ARCHITECTURE.md), [Testing](docs/TESTING.md), and the [Changelog](CHANGELOG.md). Report vulnerabilities according to [Security](SECURITY.md), not in public issue reports.

## License

Project code is available under the **[MIT License](LICENSE)**, including commercial use subject to its terms. This is an independent community project, not an official DeepSeek extension. Third-party trademarks and brand assets are not licensed by the code license; see [NOTICE](NOTICE.md).
