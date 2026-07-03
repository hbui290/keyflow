# KeyFlow

<p align="center">
  <pre align="center">
██╗  ██╗███████╗██╗   ██╗███████╗██╗      ██████╗ ██╗    ██╗
██║  ██║██╔════╝╚██╗ ██╔╝██╔════╝██║     ██╔═══██╗██║    ██║
███████║█████╗   ╚████╔╝ █████╗  ██║     ██║   ██║██║ █╗ ██║
██╔══██║██╔══╝    ╚██╔╝  ██╔══╝  ██║     ██║   ██║██║███╗██║
██║  ██║███████╗   ██║   ██║     ███████╗╚██████╔╝╚███╔███╔╝
╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝
  </pre>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-blue.svg?style=flat-square" alt="Platform: macOS" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License: MIT" />
</p>

**Switch between multiple OpenAI Codex accounts in one click, right from your Mac's menu bar.**

The official Codex Desktop app only supports one signed-in account at a time. If you juggle multiple ChatGPT accounts (Plus, Team, Enterprise) to spread out rate limits, that means logging out and back in by hand — every time. KeyFlow keeps every account's credentials in an isolated local profile and hot-swaps the active one instantly, with live usage meters so you always know how much quota each account has left.

---

## ✨ Features

* **1-click switching** — pick an account from the menu bar popover; KeyFlow swaps credentials and restarts Codex for you.
* **Live usage at a glance** — 5-hour and weekly quota bars for every account, plus available rate-limit reset credits.
* **Sync to Codex** — if Codex ever logs itself out, one click restores your session. No re-authentication.
* **Re-login alerts** — expired accounts are flagged in red with a one-click re-login flow.
* **Session priming** — optionally keeps your 5-hour session window active with a minimal background message.
* **Local & private** — credentials never leave your machine; everything lives in `~/.keyflow/` with owner-only permissions.

---

## 📦 Installation

1. Download **`KeyFlow.dmg`** from the [latest release](https://github.com/hbui290/keyflow/releases).
2. Open the DMG and drag **KeyFlow** into your **Applications** folder.
3. Launch KeyFlow — it appears as a **K** icon in your menu bar.

> [!NOTE]
> KeyFlow is signed ad-hoc (no Apple Developer certificate). If Gatekeeper blocks the first launch, allow it under **System Settings → Privacy & Security**.

## 🚀 Getting Started

1. Click the **K** icon in the menu bar, then hit **+** to add your first account.
2. Give it a label (e.g. `personal`, `work`) and sign in through the browser window that opens.
3. Repeat for each account. Switching is now a single click on any account row.

Already signed in to Codex? KeyFlow imports your current session automatically as the first profile.

---

## 💻 CLI (`kfl`)

Everything the app does is also available from the terminal:

| Command | Description |
| :--- | :--- |
| `kfl add --label <name> [--device-auth]` | Add an account via browser login, or headless device-code auth. |
| `kfl use <id-or-label>` | Switch the active Codex account and restart Codex Desktop. |
| `kfl status [--json]` | Show active account, usage, and link health. |
| `kfl relogin <id-or-label> [--device-auth]` | Re-authenticate an expired account. |
| `kfl remove <id-or-label> [--purge]` | Remove an account; `--purge` also deletes its cached profile. |
| `kfl prime [--account <id-or-label>]` | Keep the 5-hour session window active. |
| `kfl refresh [--all]` | Refresh usage data for the active account, or all accounts. |
| `kfl doctor` | Run environment diagnostics. |
| `kfl link-current` | Import the account currently signed in to Codex. |

---

## 🔒 Privacy & Security

* All data stays on your machine — KeyFlow only talks to OpenAI's own endpoints (token refresh, usage).
* Credentials are stored under **`~/.keyflow/`** with `0700`/`0600` (owner-only) permissions.
* Before every switch, the previous session is backed up to `~/.keyflow/backups/` (last 10 kept). Backups are permission-protected, not encrypted — treat that directory as sensitive.

---

## 📖 Documentation

* [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — **build from source**, project layout, testing, packaging, architecture.
* [`docs/PRODUCT.md`](docs/PRODUCT.md) — product vision, target users, feature set.
* [`docs/USERFLOW.md`](docs/USERFLOW.md) — sequence diagrams for every flow.
* [`docs/DESIGN.md`](docs/DESIGN.md) — design tokens: colors, typography, spacing.
* [`AGENTS.md`](AGENTS.md) — contribution rules for humans and AI agents.

---

## 📄 License

KeyFlow is distributed under the MIT License. See [LICENSE](LICENSE) for details.
