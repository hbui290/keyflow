# AI Agent Guidelines — KeyFlow

This file contains repository-specific instructions and constraints for AI coding agents working on this project. Treat these rules as the source of truth for implementation, building, and validation.

---

## 1. Project Stack & Architecture Overview

KeyFlow is a macOS-native utility for managing and switching between multiple OpenAI Codex credentials. It has two layers:

1. **Backend (TypeScript / Bun)** — `src/`. Manages profiles (`ProfileService`), swaps sessions (`SessionService`), and queries OpenAI usage endpoints (`UsageService`). Exposes both a human-facing CLI (`kfl`) and a JSON IPC bridge (`kfl-bridge`) consumed by the macOS app.
2. **Frontend (Swift / SwiftUI)** — `apps/macos/Sources/KeyFlowMac/`. A status bar app displaying active session metrics and a 1-click account-switching menu. Talks to the backend exclusively through the `kfl-bridge` binary.

---

## 2. Core Build Rules (CRITICAL)

### A. CLI Updates

The CLI runs from compiled binaries under `dist/`. When modifying files in `src/`:

1. Run `bun run build` (or `bun run compile` for just the TS binaries) to recompile.
2. The task is **not** complete unless the build finishes with zero TypeScript errors (`bun run typecheck`).

### B. macOS Native App Updates

When modifying files under `apps/macos/Sources/`:

1. Run `./scripts/build-keyflow-app.sh` to recompile the bridge binaries and rebuild the Xcode release bundle.
2. Run `./scripts/pack-keyflow-dmg.sh` to repackage the `.dmg` installer.
3. Verify `swift build -c release` completes with no compiler errors. `swift test` requires a full Xcode.app (not just Command Line Tools) since the `XCTest` module isn't bundled with CLT alone — verify it if your environment has Xcode installed.

---

## 3. Testing & Validation Patterns

Before considering any implementation complete, verify with the test suites:

* **TypeScript unit tests**: run `bun test`, ensure all pass. If changes affect credentials, session management, or state, add or update coverage in `src/core/services.test.ts`.
* **Swift unit tests**: `apps/macos/Tests/KeyFlowMacTests/` covers pure-logic helpers and a few source-level invariant checks. Run via `swift test` where Xcode is available.

---

## 4. Repository Hygiene

* **Never commit**: build outputs or caches (`dist/`, `node_modules/`, `.build/`), generated `.dmg`/`.app` bundles, or anything containing real credentials (`auth.json`, `state.json`, real profile directories).
* **Mock data**: use artificial tokens and email templates (e.g. `allfr.esh2132@gmail.com`) in all test fixtures — never real accounts.
* **Docs**: product/UX/design specs live under `docs/`; `AGENTS.md` and `README.md` stay at the repo root by convention (agent tooling and GitHub both expect them there).

---

## 5. Design & Flow Alignment

* **UI consistency**: every SwiftUI change must adhere to the tokens defined in [`docs/DESIGN.md`](docs/DESIGN.md) — colors, spacing, radii, and type scale are not arbitrary.
* **Contrast**: keep text/background contrast at or above `4.5:1` (WCAG AA). There's no automated linter for this in the repo yet — check manually or with a browser accessibility inspector against the token values.
* **User flows**: changes to account add/switch/re-login/sync sequences must stay consistent with the Mermaid diagrams in [`docs/USERFLOW.md`](docs/USERFLOW.md) — update the diagram if the behavior changes.
