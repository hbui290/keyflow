# KeyFlow

> A premium, minimalist macOS native utility for managing and switching between multiple OpenAI Codex credentials.

KeyFlow integrates a high-performance TypeScript IPC bridge with a lightweight Swift status bar application, enabling developer operators to monitor API rate limits, switch active ChatGPT accounts in 1-click, and maintain continuous authentication sessions.

---

## 🌟 Key Features

* **macOS Status Bar Integration**: A quiet, monochrome icon with a stencil-cut design that reflects active session states.
* **1-Click Profile Switching**: Swiftly swap credentials without interrupting terminal workflows. KeyFlow automatically handles active session backups and app restarts.
* **Smart Session Auto-Refresh**: Protects active sessions by periodically renewing credentials, preventing unwanted logouts.
* **Contrast-Compliant Diagnostics**: Integrated system health checker, fully verified against Google Labs WCAG AA standards.
* **Dynamic Plan Themes**: Automatically color-codes plans based on account tier: PRO (Gold), ENTERPRISE (Purple), TEAM (Green), PLUS (Blue), and FREE (Gray).

---

## 📦 Project Structure

```
csw/
├── apps/macos/          # SwiftUI Native Status Bar Application
│   ├── Sources/         # Swift views, models, and notification managers
│   └── dist/            # Compiled KeyFlow.app and installer KeyFlow.dmg
├── src/                 # Backend Core Logic (TypeScript / Bun)
│   ├── core/            # Profiles, sessions, and OpenAI services
│   └── kfl-bridge.ts    # IPC communication channel
├── scripts/             # Native building and packaging scripts
└── tsconfig.json        # TypeScript configuration
```

---

## 🚀 Quick Start

### 1. Requirements
Ensure you have **Bun** and **Xcode Command Line Tools** installed on macOS:
```bash
# Check bun
bun --version

# Check swift
swift --version
```

### 2. Installation & Build
Clone this repository, install node dependencies, and build the macOS native package:
```bash
# Install dependencies
bun install

# Build the complete macOS bundle
./scripts/build-keyflow-app.sh
```
This script compiles the TypeScript backend bridge, builds the Xcode release executable, and packages them into `dist/KeyFlow.app`.

### 3. Creating Installer
To package the built application into a shareable macOS installer:
```bash
./scripts/pack-keyflow-dmg.sh
```
The final installer will be generated at `dist/KeyFlow.dmg`.

---

## 🧪 Testing & Verification
KeyFlow uses a strict testing regime. Run unit tests before making modifications:
```bash
bun test
```
All core state mutations, signature computing, and JWT extraction processes are verified with 0 failures.

---

## 📖 Specifications & Architecture Indices

For detailed developer runbooks and architectural decisions, refer to our specific documentation files:
- [**`PRODUCT.md`**](PRODUCT.md): Detailed product statement, target users, and design guidelines.
- [**`USERFLOW.md`**](USERFLOW.md): Mermaid sequence diagrams mapping account addition, switching, and sync sequences.
- [**`DESIGN.md`**](DESIGN.md): Design tokens, margins, and WCAG AA contrast specs verified by the Google Labs linter.
- [**`AGENTS.md`**](AGENTS.md): Repository instructions and constraints for developer AI agents.

---

## 📄 License
This project is licensed under the MIT License.
