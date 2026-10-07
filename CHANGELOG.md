# Changelog

Notable changes are documented here. Version numbers follow Semantic Versioning.

## [Unreleased]

## [1.0.3]

### Added
- A LINUX DO community link in the Chinese and English READMEs.

### Changed
- Renamed the selected-text context menu to “deepseek一下”.
- Reused the whale extension icon for the native context menu, extension management and panel title.

## [1.0.2]

### Added
- Illustrated reading and research examples in the README.
- Separate sidebar icon assets alongside the whale icon.

### Changed
- Simplified context-menu labels, shortcut descriptions, and error messages.
- Revised Chinese and English documentation for clearer wording and privacy guidance.
- Assigned the whale icon to the toolbar and the sidebar icon to the panel title and extension management.

## [1.0.1]

### Added
- MIT license for project code and separate third-party brand notices.
- Chinese and English product documentation, contribution and security policies.
- Architecture, privacy, and testing documentation.
- Source hygiene checks and continuous integration for packaging and behavior tests.

### Changed
- Formalized installation, update, and support guidance for a public open-source release.
- Documented successful manual Chrome acceptance for login, messaging, and selected text.
- Standardized Playwright tooling setup without changing extension runtime behavior.

## [1.0.0]

### Added
- Official DeepSeek website in a full-size Chrome native side panel.
- Context-menu and keyboard-shortcut selection append, without automatic submission.
- Per-window session queues with acknowledgement, retry, and clear controls.
- Scoped iframe embedding rules and draft-preserving input bridge.
- SVG icon source with Chrome-compatible PNG sizes.
