# AI Agent Guidelines - KeyFlow (Codex Switch)

This file contains repository-specific instructions and constraints for AI coding agents working on this project. Treat these rules as the source of truth for all implementations, building, and validation.

---

## 1. Project Stack & Architecture Overview

KeyFlow is a macOS native utility designed to manage and switch between multiple OpenAI Codex credentials. It is divided into two primary layers:
1. **Backend (TypeScript / Bun)**: Found in `src/`. Manages profiles (`ProfileService`), swaps sessions (`SessionService`), and queries OpenAI usage endpoints (`UsageService`).
2. **Frontend (Swift / SwiftUI)**: Found in `apps/macos/Sources/KeyFlowMac/`. A status bar menu application displaying active session metrics and providing a 1-click account switching menu.

---

## 2. Core Build Rules (CRITICAL)

When modifying any source code, you MUST follow these build requirements:

### A. CLI & TUI Updates
The CLI runs using compiled binaries found under `dist/`. When modifying files in `src/`:
1. You MUST run `npm run build` or `bun run build` to compile TypeScript source code.
2. The task is **NOT** complete unless the build compiles successfully with zero TypeScript compilation errors.

### B. macOS Native App Updates
When modifying files under `apps/macos/Sources/`:
1. You MUST run the build script `./scripts/build-keyflow-app.sh` to compile the TypeScript bridge and re-generate the Xcode release bundle.
2. You MUST run `./scripts/pack-keyflow-dmg.sh` to repackage the `.dmg` installation bundle.
3. Verify that the build completes successfully without Xcode compiler errors.

---

## 3. Testing & Validation Patterns

Before considering any implementation complete, you MUST verify changes using the test suites:
* **TypeScript Unit Tests**:
  * Run `bun test` to execute unit tests.
  * Ensure all tests pass.
  * If changes affect credentials, session management, or state, verify or add corresponding unit tests inside `src/core/services.test.ts`.

---

## 4. Repository Hygiene

To keep the repository clean and secure, strictly follow these constraints:
* **Forbidden Commits**:
  * Never commit build outputs, compiler caches, or temporary artifacts: `dist/`, `node_modules/`, `.build/`, or generated `.dmg`/`.app` bundles.
  * Never commit personal credentials, session tokens, or local databases: `auth.json`, `state.json`, or real profile directories.
* **Mock Data**: Use artificial tokens and email templates (`allfr.esh2132@gmail.com`) for all test fixtures.

---

## 5. Design & Flow Alignment

* **UI Consistency**: Every UI modification in the SwiftUI layout MUST adhere to tokens defined in [**`DESIGN.md`**](DESIGN.md).
* **WCAG AA Compliance**: Keep contrast ratios between background and text colors above `4.5:1` as validated by the Google Labs `design.md` linter:
  ```bash
  npx @google/design.md lint DESIGN.md
  ```
* **User Flows**: Ensure any modifications to account additions, switches, or recovery sequences conform to the Mermaid specifications documented in [**`USERFLOW.md`**](USERFLOW.md).
