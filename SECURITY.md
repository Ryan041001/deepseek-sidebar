# Security policy

## Supported versions

Security fixes target the latest published release. Older releases should be upgraded before reporting a problem that has already been resolved.

## Reporting a vulnerability

Please use the repository's **Security → Report a vulnerability** private reporting flow. Include the affected version, a minimal reproduction, impact, and suggested mitigations if available.

Do not include passwords, authentication tokens, cookies, private conversations, or identifiable browser profiles. Use synthetic test data.

If private reporting is temporarily unavailable, open an issue that only requests a private contact channel. Do not publish exploit details or sensitive evidence. There is no guaranteed response-time SLA.

## Relevant security boundaries

- The only persistent website permission is `https://chat.deepseek.com/*`.
- Website-to-extension messages are checked against their origin, source, namespace, and session token.
- The queue is exposed only to validated extension-side panel connections.
- Selected text is appended as draft text, never automatically submitted.
- The embedding rule removes framing and CSP response headers from matching official-site subframes initiated by the extension. This is a documented security trade-off, not equivalent to preserving the website's original CSP.
- Browser tests can use a local HTTPS fixture and relaxed certificate validation in a disposable profile. Those test settings do not run in the installed extension.

See [Privacy and permissions](docs/PRIVACY.md) for the complete data-flow description.

---

安全问题请通过仓库 **Security → Report a vulnerability** 私密报告，不要在公开 Issue 中披露利用步骤、登录令牌、Cookie 或真实对话。暂时无法私密报告时，可开一个仅请求私密联系渠道的 Issue。修复以最新发布版本为目标；项目不承诺商业支持 SLA。
