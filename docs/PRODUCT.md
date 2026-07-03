# Product Overview — KeyFlow

## 1. Overview & Vision

**KeyFlow** is a multi-account credential manager for the Codex Desktop app (ChatGPT client) on macOS.

Developers who own multiple ChatGPT accounts (Plus, Team, Enterprise) to spread out message rate limits run into a hard limitation: Codex Desktop only supports one signed-in account at a time, forcing a manual log-out/log-back-in cycle every time they want to switch — disruptive and easy to get wrong.

KeyFlow solves this with a 1-click account-switching mechanism, accessible through two interfaces:

* **CLI (`kfl`)** — for terminal-first workflows.
* **Native macOS status bar app (KeyFlowMac)** — runs silently in the background, offering at-a-glance diagnostics and one-click switching.

---

## 2. Target Users & Use Cases

* **Audience**: developers who rely on ChatGPT/Codex daily on macOS and manage two or more accounts to work around rate limits.
* **Core goals**:
  * See which account is active and its remaining quota (5-hour and weekly) at a glance.
  * Switch accounts without losing the current session's other state.
  * Force-resync credentials from KeyFlow back into Codex when Codex gets logged out from under it.
  * Get a clear, visible warning when an account needs re-login, not a silent failure.

---

## 3. Architecture & Core Stack

Two layers connected over a JSON IPC bridge:

### 3.1 Backend (TypeScript / Bun)

Owns all filesystem and OpenAI API interaction.

* **ProfileService** — manages global state (`state.json`) behind a file lock (`state.lock`) to prevent concurrent writers (CLI + background app timer) from corrupting it; sanitizes every read/write through `sanitizeState()`.
* **SessionService** — overwrites Codex's active `auth.json` to switch sessions, then quits and relaunches Codex Desktop via AppleScript so the new session loads into memory. Takes a timestamped backup of the previous `auth.json` before every overwrite.
* **UsageService** — fetches 5-hour and weekly usage in a single request to OpenAI's usage endpoint, then makes a second request to `/backend-api/wham/rate-limit-reset-credits` for available rate-limit reset credits.

### 3.2 Frontend (Swift / SwiftUI — KeyFlowMac)

* **KeyFlowBridgeClient** — spawns the `kfl-bridge` binary per request and decodes its JSON response; never talks to the filesystem or OpenAI directly.
* **Popover** (`MenuHeaderView` + `AccountRowView`) — shows the active account, its "In use" status, remaining resets, and two glow progress bars for 5H/weekly usage, plus quick actions (Refresh, Add, Settings, Quit). Inactive accounts list below, hidden entirely in single-account mode.
* **Manager window** — full account list with a detail pane covering usage, plan, reset credits, and a diagnostics report (Codex binary presence, directory permissions, link health).

---

## 4. Key Product Features

### 4.1 Multi-profile management

Add accounts via browser login or device-code auth; assign custom labels; each account gets a unique `authSignature` computed from its token, so logging the same account in twice updates the existing profile instead of creating a duplicate.

### 4.2 1-click switching

Clicking an inactive account swaps the session in the background and restarts Codex. UI interactions are disabled for the duration of the switch to avoid overlapping file operations.

### 4.3 Sync to Codex

If Codex loses its credentials (its `auth.json` goes missing or stops matching KeyFlow's active account) while KeyFlow still holds a valid session for that account, the active row surfaces a critical-accent warning and its action button becomes **Sync to Codex** — restoring the session with one click, no re-authentication needed.

### 4.4 Diagnostics & re-login

An account is marked `relogin_required` as soon as its token is detected as expired or revoked. The UI surfaces this with a warning color and a **Re-login** action that opens a browser or device-code flow.

### 4.5 Rate-limit reset tracking

Displays available rate-limit reset credits (e.g. "2 resets") so users can decide whether to switch accounts or spend a reset before hitting a wall.

---

## 5. Do's and Don'ts

* **Do**
  * Prioritize glanceability — the popover should communicate account health at a glance, not require reading.
  * Route every state mutation through `sanitizeState()` so unknown/legacy fields don't silently corrupt the store.
  * Back up (`backupPath`) before overwriting Codex's live credentials.
* **Don't**
  * Show redundant information (e.g. the same email twice on adjacent lines).
  * Leave inconsistent spacing between labels and values — keep metadata columns left-aligned and fixed-width.
  * Log or display tokens, cookies, or other credential material anywhere in the UI or console output.
