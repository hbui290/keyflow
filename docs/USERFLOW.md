# User Flows & Interactions — KeyFlow

This document details the user flows, UI response behaviors, and system interaction sequences of the KeyFlow application.

---

## Flow 1: Add Account

Triggered when a user connects a new ChatGPT profile to KeyFlow.

```mermaid
sequenceDiagram
    actor User as User
    participant UI as SwiftUI UI (Manager)
    participant CLI as KeyFlow Bridge (TypeScript)
    participant API as OpenAI Wham API

    User->>UI: Click "Add Account" (+)
    UI->>User: Display modal prompting for Label & Auth Method (Browser / Device Auth)
    User->>UI: Enter label and submit
    UI->>CLI: Call CLI: kfl add --label <label> [--device-auth]
    CLI->>API: Validate token and fetch account usage metadata
    API-->>CLI: Return email & usage details (if successful)

    alt Auth Success
        CLI->>CLI: Create profile subdirectory & save auth.json
        CLI->>CLI: Compute authSignature from ID Token & Email
        CLI->>CLI: Write account entry to state.json (dedupes on authSignature/email)
        CLI-->>UI: Return SUCCESS payload with Account object
        UI-->>User: Close modal, render new account in lists
    else Auth Failure
        CLI-->>UI: Return error payload (expired token / invalid format)
        UI-->>User: Display error banner with details
    end
```

---

## Flow 2: Switch Account

Triggered when the user switches their active Codex session to a different account.

```mermaid
sequenceDiagram
    actor User as User
    participant Pop as Menu Bar Popover
    participant CLI as KeyFlow Bridge (TypeScript)
    participant Codex as Codex Desktop (Electron App)

    User->>Pop: Click Account B (inactive row in the list)
    Pop->>Pop: Disable UI interactions, show loading spinner
    Pop->>CLI: Call CLI: kfl use --account <id-B>

    CLI->>CLI: Read state.json, resolve profile directory for B
    CLI->>CLI: Back up Codex's current active auth.json (timestamped)
    CLI->>CLI: Copy B's auth.json to Codex's auth path

    alt Codex Desktop was running
        CLI->>Codex: Quit via AppleScript, poll until the process exits (or force-kill after timeout)
        CLI->>Codex: Relaunch Codex Desktop (loads B's session into memory)
    else Codex Desktop was not running
        CLI->>CLI: Skip relaunch — leave Codex closed
    end

    CLI->>CLI: Update activeAccountId = B in state.json
    CLI-->>Pop: Return SUCCESS payload for B
    Pop->>Pop: Update header to B, move A to the inactive list
    Pop->>Pop: Re-enable UI interactions
    Pop-->>User: Complete account transition
```

---

## Flow 3: Sync to Codex

A rescue sequence for when Codex Desktop has lost its credentials (missing or stale `auth.json`) while KeyFlow still holds a valid session for the active account — most commonly after a token rotation that didn't propagate, or Codex being logged out externally.

```mermaid
sequenceDiagram
    actor User as User
    participant Pop as Menu Bar Popover
    participant CLI as KeyFlow Bridge (TypeScript)
    participant Codex as Codex Desktop (Electron App)

    Note over CLI: Background check detects Codex's auth.json missing / not matching the active profile
    CLI->>CLI: Mark active account usage status as "relogin_required", codexLinked = false
    CLI-->>Pop: Push state update
    Pop->>Pop: Show warning banner "Codex unlinked — tap Sync to Codex"
    Pop->>Pop: Active row + status text switch to the critical accent color
    Pop->>Pop: Switch button becomes "Sync to Codex" (rotating-arrows icon)

    User->>Pop: Click "Sync to Codex"
    Pop->>Pop: Disable UI, show spinner
    Pop->>CLI: Trigger forced account switch / sync
    CLI->>CLI: Read auth.json stored under the active profile's directory
    CLI->>CLI: Write it to Codex's credentials path
    CLI->>Codex: Restart Codex Desktop via AppleScript
    CLI-->>Pop: Return SUCCESS, codexLinked = true
    Pop->>Pop: Clear the unlinked banner, status color returns to normal
    Pop-->>User: Account is logged back into Codex
```

---

## Flow 4: Re-login

Triggered when a session token expires or is revoked, prompting the user to re-authenticate.

```mermaid
sequenceDiagram
    actor User as User
    participant Pop as Menu Bar Popover
    participant CLI as KeyFlow Backend

    Note over CLI: API request returns 401 Unauthorized
    CLI->>CLI: Update account status to "relogin_required" in state.json
    CLI-->>Pop: Push state update
    Pop->>Pop: Row shows the "Re-login required" note and critical-accent color

    User->>Pop: Click "Re-login"
    Pop->>CLI: Initialize reloginAccount process
    CLI->>User: Open browser/device-code login prompt
    User->>CLI: Complete login
    CLI->>CLI: Compare auth.json mtime before/after — confirms a new login actually happened
    CLI->>CLI: Save new auth.json & reset status to "ok"
    CLI-->>Pop: Return SUCCESS
    Pop->>Pop: Restore normal switch button and status color
```

---

## Flow 5: Usage & Reset Credits Refresh

Synchronizes 5-hour usage, weekly usage, and rate-limit reset credits from OpenAI to the UI.

```mermaid
sequenceDiagram
    participant CLI as KeyFlow Backend
    participant API as OpenAI API Endpoints
    participant UI as SwiftUI UI

    Note over CLI: Periodic sync, app-open refresh, or manual "Refresh" click
    CLI->>API: Fetch 5H + weekly usage (single request)
    API-->>CLI: Return usage windows (used %, remaining %, reset time)
    CLI->>API: Fetch rate-limit reset credits (second request)
    API-->>CLI: Return available reset count (e.g. 2)
    CLI->>CLI: Run sanitizeState() to preserve rateLimitResets on write
    CLI->>CLI: Write updates to state.json
    CLI-->>UI: Send updated payload via IPC bridge
    UI->>UI: Update glow progress bars
    UI->>UI: Render "In use • 2 resets" in the popover header
    UI->>UI: Render "RESETS: 2" in the detail inspector
```
