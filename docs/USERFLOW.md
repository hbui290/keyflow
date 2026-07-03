# User Flows & Interactions Guide - KeyFlow (Codex Switch)

This document details the user flows, UI response behaviors, and system interaction sequences of the **KeyFlow** application on macOS.

---

## Flow 1: Add Account Flow

Triggered when a user connects a new ChatGPT profile to KeyFlow.

```mermaid
sequenceDiagram
    actor User as User
    participant UI as SwiftUI UI (Manager)
    participant CLI as KeyFlow Bridge (TypeScript)
    participant API as OpenAI Wham API

    User->>UI: Click "Add Account" (+)
    UI->>User: Display modal prompting for Label & Auth Method (Cookie / Device Auth)
    User->>UI: Enter credentials and submit
    UI->>CLI: Call CLI: kfl add --label <label> [--device-auth]
    CLI->>API: Validate token and fetch account usage metadata
    API-->>CLI: Return email & usage details (if successful)
    
    alt Auth Success
        CLI->>CLI: Create profile subdirectory & save auth.json
        CLI->>CLI: Compute authSignature from ID Token & Email
        CLI->>CLI: Write account entry to state.json
        CLI-->>UI: Return SUCCESS payload with Account object
        UI-->>User: Close modal, render new account in lists
    else Auth Failure
        CLI-->>UI: Return error payload (Expired token / Invalid format)
        UI-->>User: Display red warning banner with error details
    end
```

---

## Flow 2: Switch Account Flow

Triggered when the user switches their active Codex session to a different account.

```mermaid
sequenceDiagram
    actor User as User
    participant Pop as Menu Bar Popover
    participant CLI as KeyFlow Bridge (TypeScript)
    participant Codex as Codex Desktop (Electron App)

    User->>Pop: Click Account B (Inactive row in the list)
    Pop->>Pop: Disable UI interactions, show loading spinner
    Pop->>CLI: Call CLI: kfl use --account <id-B>
    
    CLI->>CLI: Read state.json, resolve profile directory for B
    CLI->>CLI: Create a timestamped backup of Codex's active auth.json
    CLI->>CLI: Copy B's auth.json to Codex's auth path
    
    CLI->>Codex: Terminate Codex Desktop app via AppleScript
    CLI->>Codex: Relaunch Codex Desktop app (loads B's session into RAM)
    
    CLI->>CLI: Update activeAccountId = B in state.json
    CLI-->>Pop: Return SUCCESS payload for B
    Pop->>Pop: Update Header to B, move A to the inactive list
    Pop->>Pop: Re-enable UI interactions
    Pop-->>User: Complete account transition
```

---

## Flow 3: Active Codex Syncing (Sync to Codex Flow)

A rescue sequence when the Codex Desktop application is logged out (missing auth credentials) but KeyFlow retains a valid session for the active account.

```mermaid
sequenceDiagram
    actor User as User
    participant Pop as Menu Bar Popover
    participant CLI as KeyFlow Bridge (TypeScript)
    participant Codex as Codex Desktop (Electron App)

    Note over CLI: Background check detects Codex credentials missing / unlinked
    CLI->>CLI: Mark active account usage status as "relogin_required"
    CLI-->>Pop: Push state update
    Pop->>Pop: Display red warning banner "Codex unlinked"
    Pop->>Pop: Upgrade the Switch button to active "Sync to Codex" (Rotating icon)
    
    User->>Pop: Click "Sync to Codex"
    Pop->>Pop: Disable UI, show spinner
    Pop->>CLI: Trigger forced account switch / sync
    CLI->>CLI: Read auth.json stored under active profile's directory
    CLI->>CLI: Write active auth.json to Codex's credentials path
    CLI->>Codex: Restart Codex Desktop app via AppleScript
    CLI-->>Pop: Return SUCCESS
    Pop->>Pop: Clear error banner, restore green diagnostics shield
    Pop-->>User: Automatically log back into Codex
```

---

## Flow 4: Re-login Flow

Triggered when a session token expires, prompting the user to re-authenticate the account.

```mermaid
sequenceDiagram
    actor User as User
    participant Pop as Menu Bar Popover
    participant CLI as KeyFlow Backend

    Note over CLI: API request returns 401 Unauthorized
    CLI->>CLI: Update account status to "relogin_required" in state.json
    CLI-->>Pop: Push state update
    Pop->>Pop: Upgrade Switch button to red "Re-login" button
    
    User->>Pop: Click "Re-login"
    Pop->>CLI: Initialize reloginAccount process
    CLI->>User: Open browser/terminal login prompt
    User->>CLI: Complete login sequence
    CLI->>CLI: Save new auth.json & reset status to "ok"
    CLI-->>Pop: Return SUCCESS
    Pop->>Pop: Restore standard switch buttons
```

---

## Flow 5: Check Usage & Resets Flow

Synchronizes 5H, Weekly usage, and rate-limit reset credits from OpenAI to the UI.

```mermaid
sequenceDiagram
    participant CLI as KeyFlow Backend
    participant API as OpenAI API Endpoints
    participant UI as SwiftUI UI

    Note over CLI: Periodic sync or manual "Refresh" trigger
    CLI->>API: Query in parallel:
    Note over CLI: 1. 5H / Weekly Quotas
    Note over CLI: 2. Reset Credits (/wham/rate-limit-reset-credits)
    API-->>CLI: Return usage metadata and reset count (e.g. available_count = 2)
    CLI->>CLI: Run sanitizeState() to preserve rateLimitResets
    CLI->>CLI: Write updates to state.json
    CLI-->>UI: Send updated payload via IPC Bridge
    UI->>UI: Update glowing progress bars
    UI->>UI: Render "In use • 2 resets" in Popover Header
    UI->>UI: Render "RESETS: 2" in Detail Inspector
```
