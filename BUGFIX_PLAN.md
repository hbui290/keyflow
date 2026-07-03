# KeyFlow — Bug Report & Fix Blueprint

> Audit 3 vòng (line-by-line, per-pipeline) ngày 2026-07-03. 34 issues.
> Verified: `tsc --noEmit` (2 lỗi), `bun test` (7/7 pass), `swift build` (sạch), gitignore chuẩn AGENTS.md.
> Chưa verified runtime: login/relogin thật, token rotation, chạy DMG trên máy không có Bun.

**Quy tắc chung khi fix (theo AGENTS.md):** sửa `src/` xong phải `bun run typecheck` + `bun test` + `bun run build` zero-error; sửa `apps/macos/Sources/` xong phải chạy `./scripts/build-keyflow-app.sh` và `./scripts/pack-keyflow-dmg.sh`.

---

## Phase 0 — Baseline

```bash
git checkout -b fix/audit-2026-07
bun run typecheck   # kỳ vọng: 2 lỗi (BUG-01, BUG-02)
bun test            # kỳ vọng: 7/7 pass
```

---

## Phase 1 — Lỗi compile (chặn CI) 🔴

### BUG-01 · Thiếu import `UsageSnapshot`
- **Vị trí:** `src/core/ProfileService.ts:520`
- **Lý do:** dòng 5 chỉ import `Account, AppState, AuthTokens`; `refreshUsage` khai báo `const failedUsage: UsageSnapshot`.
- **Cách xử lý chuẩn:**
  ```ts
  import type { Account, AppState, AuthTokens, UsageSnapshot } from './types.js'
  ```
- **Verify:** `bun run typecheck` hết lỗi TS2304.

### BUG-02 · Mock `getPaths()` thiếu field trong test
- **Vị trí:** `src/core/services.test.ts:148`
- **Lý do:** mock trả object thiếu `switchHome`, `backupsDir` so với return type thật.
- **Cách xử lý chuẩn:** bổ sung 2 field vào mock:
  ```ts
  ProfileService.getPaths = () => ({
    switchHome: testDir,
    backupsDir: path.join(testDir, 'backups'),
    codexHome, codexAuthPath,
    profilesDir: path.join(testDir, 'profiles'),
    statePath: path.join(testDir, 'state.json'),
  })
  ```
- **Verify:** `bun run typecheck` sạch 100%, `bun test` vẫn pass.

---

## Phase 2 — An toàn dữ liệu 🔴

### BUG-06 · `readState` nuốt lỗi → nguy cơ wipe toàn bộ accounts
- **Vị trí:** `src/core/ProfileService.ts:72-84`
- **Lý do:** `catch` bắt mọi lỗi (JSON hỏng, EACCES, lỗi I/O tạm thời) và trả state rỗng. Vì `ensureCurrentCodexLinked` chạy trước mọi lệnh CLI và **ghi** state, một lần đọc lỗi = lần ghi kế tiếp xoá sạch accounts.
- **Cách xử lý chuẩn:** chỉ coi `ENOENT` là state rỗng hợp lệ. Lỗi khác: backup file hỏng rồi throw để user biết, không silent-reset:
  ```ts
  } catch (err: any) {
    if (err?.code === 'ENOENT') return this.buildEmptyState()
    try { await fs.copyFile(STATE_PATH, `${STATE_PATH}.corrupt-${Date.now()}`) } catch {}
    throw new Error(`state.json unreadable (${err.message}). Backup saved, refusing to overwrite.`)
  }
  ```
- **Verify:** test mới — ghi `state.json` chứa `"{invalid"` → `readState` throw, file backup `.corrupt-*` tồn tại, state gốc không bị ghi đè.

### BUG-11 + BUG-12 · Race ghi `state.json` (timer app 120s vs CLI, và add/relogin giữ state cũ suốt 2 phút login)
- **Vị trí:** toàn pipeline; cụ thể `ProfileService.ts:359→386` (add), `:415→436` (relogin).
- **Lý do:** nhiều process (app bridge + CLI tay) read-modify-write không lock; `addAccount` đọc state trước khi chờ user login (tối đa 2'), ghi lại bản cũ → lost update.
- **Cách xử lý chuẩn (2 lớp):**
  1. **Lock file** quanh mọi write: tạo `~/.keyflow/state.lock` bằng `fs.open(lockPath, 'wx')`, retry ~5s, xoá khi xong (kèm stale-lock check theo mtime > 30s).
  2. **Re-read trước khi ghi** trong `addAccount`/`reloginAccount`: sau khi login xong, `const fresh = await this.readState()` rồi merge account mới vào `fresh`, không dùng `state` cũ.
- **Verify:** test tích hợp — chạy 2 process `kfl refresh --all` song song 20 lần, so account count trước/sau không đổi.

### BUG-15 + BUG-16 · Backup token vô hạn; `--purge` không sạch
- **Vị trí:** `SessionService.ts:100-107`, `ProfileService.ts:408-410`
- **Lý do:** mỗi switch tạo 1 file `auth.json` plaintext trong `~/.keyflow/backups/` không bao giờ xoá; purge chỉ xoá profileDir, token còn trong backups.
- **Cách xử lý chuẩn:** sau khi tạo backup, prune giữ **10 file mới nhất** (readdir → sort → unlink phần thừa). Purge thì log cảnh báo cho user rằng backups/`~/.codex/auth.json` có thể còn token cũ (không tự xoá auth đang active — tránh phá session).
- **Verify:** switch 15 lần → backups đúng 10 file.

---

## Phase 3 — Recovery flows (relogin & sync) 🔴

### BUG-03 · Relogin no-op (kill login sau 500ms, nhận token cũ)
- **Vị trí:** `src/core/SessionService.ts:269-344` (`runCodexChatGptLogin`)
- **Lý do:** hàm poll **sự tồn tại** của `profileDir/auth.json` để biết login xong. Case relogin file đã tồn tại sẵn → poll đầu (500ms) trả true → `stopProcess()` kill `codex login`, handler `close` thấy `checkAuth()==true` → resolve "thành công" với token CŨ. Trái USERFLOW Flow 4 (user phải hoàn tất login trước khi save).
- **Cách xử lý chuẩn:** so **mtime**, không so existence. Trước khi spawn:
  ```ts
  const authPath = path.join(profileDir, 'auth.json')
  const before = await fs.stat(authPath).then(s => s.mtimeMs).catch(() => 0)
  const checkAuth = async () => {
    const now = await fs.stat(authPath).then(s => s.mtimeMs).catch(() => 0)
    return now > before   // chỉ true khi codex GHI MỚI auth.json
  }
  ```
  (Không xoá file cũ — nếu login fail còn giữ được token cũ để fallback.)
- **Verify:** tạo profile có auth.json sẵn → gọi `runCodexChatGptLogin` với codex giả (script sleep 5s rồi touch auth.json) → promise chỉ resolve sau khi file được ghi mới; nếu không ghi → timeout reject.

### BUG-04 · "Sync to Codex" bị chính guard chặn
- **Vị trí:** `ProfileService.ts:453-455` (guard) + `:246-248` (set trạng thái)
- **Lý do:** Codex unlinked → active account bị set `relogin_required` (dù auth trong profile còn tốt) → user bấm Sync → `bridgeUse` → `useAccount` **throw** "requires login before use". Flow 3 USERFLOW chết ngay điểm vào.
- **Cách xử lý chuẩn:** guard theo **tình trạng thật của auth file trong profile**, không theo status usage:
  ```ts
  if (account.usage.status === 'relogin_required') {
    const ok = await fs.access(path.join(account.profileDir, 'auth.json')).then(() => true, () => false)
    if (!ok) throw new Error(`Account "${...}" requires login before use.`)
    // auth còn → cho phép sync (đúng Flow 3)
  }
  ```
  Đồng thời tách trạng thái: Codex-unlinked nên là cờ riêng (vd `codexLinked: false` trong payload) thay vì mượn `relogin_required` của account.
- **Verify:** xoá `~/.codex/auth.json` → `kfl bridge use --account <active>` phải succeed và khôi phục file.

### BUG-17 · `isUnlinked` detect bằng string banner UI
- **Vị trí:** `apps/macos/.../Views.swift:1054`
- **Lý do:** `model.banner?.message.contains("not logged in")` — banner là UI tạm, bị message khác đè là nút Sync biến mất.
- **Cách xử lý chuẩn:** sau khi làm BUG-04, bridge trả cờ `codexLinked` trong `BridgeStatusPayload`; Swift decode và dùng `!status.codexLinked && account.isActive` thay cho string-match.
- **Verify:** unlink Codex → mở popover → refresh vài lần → nút "Sync to Codex" vẫn hiển thị ổn định.

---

## Phase 4 — Đóng gói & IPC 🔴/🟡

### BUG-05 · App chết trên máy không có Bun
- **Vị trí:** `KeyFlowBridgeClient.swift:38-52`
- **Lý do:** `init` gọi `resolveBunExecutable` (throw `bunNotFound`) **trước** khi check bundled bridge — nhưng `kfl-bridge` trong bundle là binary standalone (`bun build --compile`), không cần Bun. DMG đưa máy khác = app hiện lỗi rồi tê liệt.
- **Cách xử lý chuẩn:** đảo thứ tự — check bundled bridge trước, chỉ resolve Bun ở nhánh dev (repo fallback):
  ```swift
  init() throws {
    self.environment = Self.buildBridgeEnvironment()
    if let bundled = Self.resolveBundledBridge() {   // bỏ param bunURL không dùng
      self.initialCommand = bundled; return
    }
    self.initialCommand = try Self.resolveRepoBridge()
  }
  ```
  (`resolveRepoBridge` cũng chạy binary `dist/kfl-bridge` trực tiếp — thực tế không cần Bun ở runtime; có thể xoá hẳn `resolveBunExecutable`.)
- **Verify:** build app, `PATH=/usr/bin:/bin open dist/KeyFlow.app` (PATH không có bun) → app hoạt động.

### BUG-19 · Pipe deadlock khi output > 64KB
- **Vị trí:** `KeyFlowBridgeClient.swift:126-128`
- **Lý do:** đọc `readDataToEndOfFile` bên trong `terminationHandler` — buffer pipe đầy thì process con block write, không bao giờ terminate → treo.
- **Cách xử lý chuẩn:** đọc bằng `readabilityHandler` gom data song song, hoặc đọc `readDataToEndOfFile` trên background queue **trước** rồi `waitUntilExit`. Pattern chuẩn:
  ```swift
  var outData = Data()
  stdout.fileHandleForReading.readabilityHandler = { h in outData.append(h.availableData) }
  ```
- **Verify:** bridge giả in 1MB JSON → app không treo.

### BUG-32 · `zsh -lc` đồng bộ trên main thread lúc launch
- **Vị trí:** `KeyFlowBridgeClient.swift:250-277`
- **Lý do:** `resolveLoginShellPath` spawn login shell + `waitUntilExit` ngay trong `KeyFlowAppModel.init()` (main thread) — shell rc chậm = beachball.
- **Cách xử lý chuẩn:** đơn giản nhất là cache kết quả 1 lần và chuyển khởi tạo `KeyFlowBridgeClient` vào `Task.detached` trong `bootstrap()`; hoặc bỏ hẳn login-shell PATH (commonPaths đã đủ vì bridge là binary bundled).
- **Verify:** thêm `sleep 3` vào `~/.zshrc` → app vẫn hiện status bar ngay.

---

## Phase 5 — Usage & auto-prime 🟡

### BUG-08 · Auto-prime khi thiếu dữ liệu usage
- **Vị trí:** `KeyFlowAppModel.swift:389-390`
- **Lý do:** `remainingPercent ?? 0.0` — `nil` (chưa biết) bị coi là 0% (hết quota) → tự prime, đốt message của account chưa có số liệu; status `never`/`stale` cũng không bị loại.
- **Cách xử lý chuẩn:**
  ```swift
  guard account.usage.status == .ok,
        let remaining = account.usage.last5Hours.remainingPercent else { return }
  if remaining <= 0.01 { ... }
  ```
- **Verify:** account mới (usage nil) → không có notification auto-prime.

### BUG-07 · Refresh token rotation không sync về `~/.codex/auth.json`
- **Vị trí:** `SessionService.ts:172-202` + `UsageService.ts:86`
- **Lý do:** profile copy được refresh (token mới, có thể rotate) nhưng bản live của Codex giữ refresh token cũ → nếu server rotate, Codex bị logout ngẫu nhiên. Nghi phạm chính của hiện tượng "Codex unlinked".
- **Cách xử lý chuẩn:** trong `saveAuthTokens`, nếu profile đang là account active (so đường dẫn với state) thì ghi thêm bản copy sang `paths.codexAuthPath` (qua `writePrivateFile`, atomic). Cần đọc state để biết active — truyền cờ `isActive` từ caller để tránh vòng import.
- **Verify:** refresh usage account active → mtime `~/.codex/auth.json` thay đổi và chứa access_token mới.

### BUG-09 · Fallback session logs đọc nhầm account
- **Vị trí:** `UsageService.ts:203-204`
- **Lý do:** `~/.codex/sessions` là log của account **đang active trong Codex**, không phải của profileDir đang refresh → account A hiển thị usage của B.
- **Cách xử lý chuẩn:** chỉ dùng fallback khi profileDir là account active (truyền `isActive` vào `resolveUsageSnapshot`); ngược lại trả `stale` giữ số liệu cũ.
- **Verify:** refresh account B khi active là A, API fail → B giữ usage cũ + status `stale`, không nhận số của A.

### BUG-10 + BUG-28 · Device-auth: URL fallback sai + regex match nhầm
- **Vị trí:** `SessionService.ts:285-311`
- **Lý do:** fallback `https://github.com/login/device` là copy-paste sai (login OpenAI); regex thứ hai `([A-Z0-9]{4}-[A-Z0-9]{4})/i` match cả UUID fragment.
- **Cách xử lý chuẩn:** bỏ fallback GitHub (không mở URL nếu không match được URL thật từ output); chỉ giữ regex có prefix `code:\s*`, bỏ alternative trần.
- **Verify:** unit test với stdout mẫu của codex device-auth thật.

### BUG-18 · Mọi lệnh CLI đều gọi network trước
- **Vị trí:** `src/cli.ts:59-61`
- **Lý do:** `ensureCurrentCodexLinked()` (refreshUsage mặc định true) chạy trước cả `status`/`doctor`/`remove`.
- **Cách xử lý chuẩn:** whitelist lệnh cần link (`use`, `refresh`, `prime`); các lệnh read-only gọi với `{ refreshUsage: false }` hoặc bỏ hẳn.
- **Verify:** `time kfl status` < 200ms khi offline.

---

## Phase 6 — Polish & docs 🟢

| ID | Fix chuẩn | Verify |
|----|-----------|--------|
| BUG-20 `Views.swift:624` | `BannerView.color`: `.error/.warning` → `criticalAccent` theo DESIGN.md | build + nhìn banner đỏ |
| BUG-21 `UsageService.ts:173` | `const message = error?.message ?? String(error)` | test throw non-Error |
| BUG-22 `UsageService.ts:31` | regex thêm `^\s*` + flag `m`, loại dòng bắt đầu `#` | unit test config comment |
| BUG-23 `ProfileService.ts:520` | `failedUsage` thêm `rateLimitResets: acc.usage.rateLimitResets ?? null` | refresh lỗi giữ resets |
| BUG-24 `SessionService.ts:86` | chỉ `open -a` nếu trước đó `checkRunning()` true | switch khi Codex tắt → không mở |
| BUG-25 `SessionService.ts:79` | poll `checkRunning` mỗi 200ms tối đa 5s thay sleep cứng | switch trên máy chậm |
| BUG-26 `SessionService.ts:96` | `fs.access` trước, `chmod` sau | lỗi ENOENT có message rõ |
| BUG-27 `SessionService.ts:58` | `on('error', e => resolve({status:1, stdout, stderr: e.message}))` | doctor báo đúng lý do |
| BUG-29 `ProfileService.ts:58` | xoá hàm lồng, dùng `this.ensurePrivateDir` | typecheck + test |
| BUG-30 `Views.swift:115` | hash ổn định (djb2 trên UTF8) thay `hashValue` | màu avatar giữ nguyên sau relaunch |
| BUG-31 `Views.swift:1528` | đưa autoPrime vào `@Published` dict trong model, ghi UD khi set | toggle nhảy đúng |
| BUG-33 scripts | codesign: chấp nhận ad-hoc nội bộ, ghi chú README; cân nhắc tách `compile` khỏi `rm -rf dist` | pack lại dmg |
| BUG-34 docs | thêm LICENSE (MIT), bổ sung `relogin`/`prime` vào README, sửa PRD "parallel"/TUI cho khớp thực tế | review docs |
| BUG-13 `ProfileService.ts:354` | `addAccount`: sau login, so `computeAuthSignature`/email với accounts hiện có → nếu trùng thì update account cũ thay vì tạo mới (đúng PRD 4.1) | add cùng account 2 lần → 1 profile |
| BUG-14 `Views.swift:1228` | Cancel phải kill được process: bridge hỗ trợ cancel là việc lớn — tối thiểu: giữ nguyên `currentOperation` (đổi nút thành "Đang chạy…", disable), không clear flag khi process còn sống | cancel không mở khoá op song song |

---

## Trình tự thực thi khuyến nghị

```text
1. Phase 1 (BUG-01, 02)        -> verify: typecheck + test xanh        (~5 phút)
2. Phase 2 (BUG-06, 11/12)     -> verify: test corrupt-state + race    (nửa buổi)
3. Phase 3 (BUG-03, 04, 17)    -> verify: flow relogin/sync thủ công   (nửa buổi)
4. Phase 4 (BUG-05, 19, 32)    -> verify: build app + máy sạch Bun     (nửa buổi)
5. Phase 5 (BUG-07..10, 18)    -> verify: unit + quan sát runtime      (1 buổi)
6. Phase 6 (còn lại)           -> verify: theo bảng                    (1 buổi)
```

Mỗi phase 1 commit riêng, message theo pipeline (vd `fix(session): relogin polls mtime instead of existence`).

---

*P.S. — Bản audit này tìm ra 34 lỗi trong đó 7 lỗi nghiêm trọng nằm ngay trên các flow chính. Nếu Antigravity đã từng bay qua repo này thì chắc nó bay hơi cao nên không nhìn thấy gì ở tầng code. Trọng lực có thể là tuỳ chọn, nhưng đọc kỹ `runCodexChatGptLogin` thì không. 🛰️*
