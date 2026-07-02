# Product Requirement Document (PRD) - Codex Switch (KeyFlow)

## 1. Overview & Vision

**Codex Switch** (commercially branded as **KeyFlow**) is a professional multi-account management solution built for developers using the Codex Desktop app (ChatGPT client) on macOS.

Many developers own multiple ChatGPT accounts (Plus, Team, Enterprise) to optimize message rate limits. However, the official Codex Desktop app does not support account switching, forcing users to manually log out and log back in, which is highly disruptive to their workflow.

**Codex Switch** addresses this pain point by providing a seamless, 1-click account switching mechanism accessible via three interfaces:
* **CLI (Command Line Interface)**: For terminal-heavy developers who prefer quick commands.
* **TUI (Terminal User Interface)**: An interactive terminal interface for browsing and switching profiles.
* **Native macOS Status Bar App (KeyFlowMac)**: A premium macOS menu bar app that runs silently in the background, offering instant diagnostics and a fluid switching interface.

---

## 2. Target Users & Use Cases

* **Target Audience**: Software engineers and developers who heavily rely on ChatGPT/Codex in their daily macOS workflow and manage two or more accounts to bypass rate limits.
* **Core Goals**:
  * Identify which account is active (**In use**) and check its message quota (5H, Weekly) at a single glance.
  * Switch accounts safely without losing the current session.
  * Force-sync credentials from KeyFlow back to Codex when Codex gets logged out.
  * Highlight account errors and request a **Re-login** visually and intuitively.

---

## 3. Product Architecture & Core Tech Stack

The project is split into two main layers connected via Inter-Process Communication (IPC):

### 3.1 Backend Core (TypeScript / Bun)
Handles system logic, file system operations, and OpenAI API endpoint interactions.
* **ProfileService**: 
  * Manages global app state in `state.json`.
  * Sanitizes data structures via `sanitizeState()` to preserve new properties such as `rateLimitResets`.
  * Manages isolated profile directories to store cookies and authentications.
* **SessionService**:
  * Overwrites Codex's active credentials in `auth.json` to swap sessions.
  * Uses AppleScript to terminate and relaunch the Codex Desktop application (`restartCodexDesktopApp`) to immediately apply the new cached session on RAM.
* **UsageService**:
  * Fetches 5-hour and Weekly message usage snapshots in parallel.
  * Queries OpenAI's `/backend-api/wham/rate-limit-reset-credits` endpoint to retrieve available rate limit reset credits (`rateLimitResets`).

### 3.2 Frontend Layer (Swift / SwiftUI - KeyFlowMac)
A native macOS status bar app:
* **KeyFlowBridgeClient**: Handles IPC communications to execute the Bun CLI and parse returning JSON payloads.
* **Popover View**: 
  * **MenuHeaderView**: The top panel displaying the active account, email, **`In use`** status, and available **`resets`**. Contains quick action buttons (Refresh, Add, Settings, Power).
  * **Usage Section**: Renders two glowing progress bars representing 5H and Weekly usage quotas along with precise reset timestamps.
  * **Metadata Section**: A clean, balanced key-value grid showing synchronization time (`SYNCED`), account plan (`PLAN`), and rate limit credits (`RESETS`).
  * **ScrollView List**: Lists inactive accounts for quick switching. Automatically hides in single-account mode to keep the interface compact.
* **Manager Window**: A full management interface featuring an account list sidebar and a detailed Diagnostics view (network checks, token health, Codex linkage status, etc.).

---

## 4. Key Product Features

### 4.1 Multi-profile Management
* Add new accounts via standard cookie extraction or advanced Device Authentication.
* Assign custom labels to profiles for easy identification.
* Automatically generate unique signatures (`authSignature`) based on login tokens to prevent duplicate profiles.

### 4.2 1-Click Fast Switching
* Clicking an inactive account in the Popover or Manager triggers a background session swap and restarts Codex.app.
* Disables interaction buttons during transit to ensure asynchronous background operations complete safely without file conflicts.

### 4.3 Active Codex Syncing (Sync to Codex)
* Detects when Codex gets logged out (missing `auth.json`) and presents a prominent warning banner or upgrades the switch button to **`Sync to Codex`**.
* Restores Codex credentials instantly with one click, without requiring the user to re-enter credentials.

### 4.4 Diagnostics & Re-login
* Marks profiles as `relogin_required` immediately upon detecting expired tokens, revoked cookies, or invalid sessions.
* Displays a warning banner with a **`Re-login`** button, prompting the user to complete authentication in a browser or terminal window.

### 4.5 Rate-limit Reset Credits Tracking
* Tracks and displays available rate limit reset credits (e.g., "2 resets").
* Allows users to make informed switching decisions before current account limits are reached.

---

## 5. Do's and Don'ts

* **Do's**:
  * Prioritize "Glanceability". The menu bar UI should display core usage data clearly and concisely.
  * Maintain clean state file writing; always filter properties using `sanitizeState()`.
  * Ensure session syncing is safe; always create a backup (`backupPath`) before overwriting Codex's credentials.
* **Don'ts**:
  * Do not display redundant information (such as duplicate emails on adjacent lines).
  * Do not leave irregular empty spaces between labels and values; align elements left-justified in a clean column.
  * Do not leak sensitive tokens or account keys in logs or public interfaces.
