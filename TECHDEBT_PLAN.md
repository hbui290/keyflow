# KeyFlow — Tech Debt Cleanup Plan (đợt 2)

Phạm vi: 10 mục còn lại sau đợt vá BUGFIX_PLAN.md (0 critical, 1 medium, 9 minor).
Nguyên tắc: diff nhỏ nhất, 1 commit / batch, verify sau mỗi batch.

```text
Batch A (TS core)    -> verify: bun run typecheck + bun test
Batch B (Swift UI)   -> verify: swift build -c release + chạy app nhìn bằng mắt
Batch C (restart)    -> verify: switch account khi Codex tắt/mở
Batch D (docs/build) -> verify: review docs + pack dmg
```

---

## Batch A — TS core (~30 phút, 1 commit)

### BUG-21 · `UsageService.ts:173` — `.message` trên non-Error
```ts
// trước
const message = error.message
// sau
const message = error?.message ?? String(error)
```
Verify: không còn chỗ nào `.message` trần trên giá trị catch trong file (`rg '\berror\.message' src/core/UsageService.ts`).

### BUG-22 · `UsageService.ts:31` — regex match dòng comment trong config.toml
```ts
// trước
const match = config.match(/chatgpt_base_url\s*=\s*["']?([^"'\s]+)["']?/)
// sau: neo đầu dòng, loại dòng bắt đầu bằng #
const match = config.match(/^\s*chatgpt_base_url\s*=\s*["']?([^"'\s]+)["']?/m)
```
Verify: unit test nhỏ — config có `# chatgpt_base_url = https://evil` phía trên dòng thật → lấy dòng thật; chỉ có dòng comment → trả DEFAULT.

### BUG-23 · `ProfileService.ts:621` — `failedUsage` rớt `rateLimitResets`
```ts
const failedUsage: UsageSnapshot = {
  ...
  weekly: acc.usage.weekly,
  rateLimitResets: acc.usage.rateLimitResets ?? null,   // thêm dòng này
}
```
Verify: refresh lỗi (tắt mạng) → số resets trên UI giữ nguyên, không biến mất.

### BUG-26 · `SessionService.ts:121` — chmod trước access
Đảo 2 dòng trong `switchToAccount`:
```ts
// trước
await ProfileService.chmodPrivateFile(sourceAuth)
await fs.access(sourceAuth)
// sau
await fs.access(sourceAuth)
await ProfileService.chmodPrivateFile(sourceAuth)
```
Verify: xoá tay `auth.json` của 1 profile → switch báo lỗi ENOENT từ `access` (message rõ), không phải từ chmod.

### BUG-27 · `SessionService.ts:58` — nuốt lý do lỗi spawn
```ts
// trước
process.on('error', () => { resolve({ status: 1, stdout, stderr }) })
// sau
process.on('error', (e) => { resolve({ status: 1, stdout, stderr: stderr || e.message }) })
```
Verify: đổi tạm `resolveCodexExecutable` thành binary không tồn tại → doctor in được lý do.

---

## Batch B — Swift UI (~1 giờ, 1 commit)

### BUG-30 · `Views.swift:115` — avatar đổi màu mỗi lần relaunch
`hashValue` của Swift random seed theo process → thay bằng hash ổn định:
```swift
// trước
let hash = displayName.hashValue
// sau: djb2 — ổn định giữa các lần chạy
let hash = displayName.utf8.reduce(5381) { ($0 << 5) &+ $0 &+ Int($1) }
```
Verify: quit + relaunch app → màu avatar từng account giữ nguyên.

### BUG-31 · `Views.swift:1528` — toggle auto-prime Binding inline UserDefaults
Fix tối thiểu (không thêm layer): giữ Binding nhưng đi qua model để view invalidate đúng.
- Thêm vào `KeyFlowAppModel`:
```swift
@Published var autoPrimeFlags: [String: Bool] = [:]

func autoPrime(for id: String) -> Bool {
    autoPrimeFlags[id] ?? (UserDefaults.standard.object(forKey: "autoPrime_\(id)") as? Bool ?? true)
}
func setAutoPrime(_ v: Bool, for id: String) {
    autoPrimeFlags[id] = v
    UserDefaults.standard.set(v, forKey: "autoPrime_\(id)")
}
```
- View: `Toggle(..., isOn: Binding(get: { model.autoPrime(for: account.id) }, set: { model.setAutoPrime($0, for: account.id) }))`
- Chỗ auto-prime trong model đọc qua `autoPrime(for:)` (cùng 1 nguồn).
Verify: bật/tắt toggle → trạng thái đúng ngay và giữ sau relaunch; logic auto-prime tôn trọng cờ.

### BUG-14 · Cancel không kill process (medium — fix tối thiểu)
Bridge chưa hỗ trợ cancel subprocess → không mở khoá UI khi process còn sống:
- `KeyFlowAppModel.cancelCurrentOperation()`: chỉ clear khi không còn task chạy —
```swift
func cancelCurrentOperation() {
    guard !hasBlockingOperation else { return }   // process còn sống thì không clear
    currentOperation = nil
}
```
- Rà mọi nút Cancel trong `Views.swift` (Add sheet :1228, Relogin sheet, …): khi `hasBlockingOperation` → nút hiển thị "Working…" + disabled (Add sheet đã disable sẵn, kiểm các sheet còn lại).
- `// ponytail: cancel thật cần bridge hỗ trợ kill — làm khi có yêu cầu`
Verify: bấm Add → trong lúc login chạy, Cancel disabled; không thể mở op thứ 2 song song.

---

## Batch C — Restart Codex (~30 phút, 1 commit)

### BUG-24 · `SessionService.ts:86` — `open -a` vô điều kiện
Chỉ relaunch nếu Codex đang chạy trước khi switch:
```ts
const wasRunning = await checkRunning()
if (wasRunning) {
  ... quit / pkill như hiện tại ...
}
if (wasRunning) {
  spawn('open', ['-a', CODEX_APP_PATH], { stdio: 'ignore' }).unref()
}
```
Verify: Codex đang tắt → switch xong Codex vẫn tắt; Codex đang mở → switch xong Codex mở lại.

### BUG-25 · sleep cứng 900ms/600ms
Thay bằng poll chờ chết, có trần:
```ts
const waitDead = async (ms: number) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (!(await checkRunning())) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}
// quit → await waitDead(3000); còn sống → pkill -TERM → await waitDead(2000)
```
Verify: switch trên máy hiện tại vẫn mượt; log không thấy pkill khi Codex quit kịp.

---

## Batch D — Docs & build (~20 phút, 1 commit)

### BUG-34 · LICENSE + README
- Tạo `LICENSE` (MIT, copyright 2026 winston) — README đang link chết.
- README: thêm `kfl relogin <account>` và `kfl prime <account>` vào bảng lệnh.

### BUG-33 · codesign nuốt lỗi
Giữ ad-hoc `|| true` (chấp nhận cho internal), nhưng in cảnh báo thay vì im lặng:
```bash
codesign --force --deep --sign - "$APP_BUNDLE" >/dev/null 2>&1 || echo "[warn] codesign ad-hoc failed — app vẫn chạy local, Gatekeeper có thể chặn khi copy máy khác"
```
Thêm 1 dòng vào README mục Build: app ký ad-hoc, không notarize.

---

## Nghiệm thu cuối (theo AGENTS.md)

```text
1. bun run typecheck        -> 0 lỗi
2. bun test                 -> 7/7 (+ test mới BUG-22)
3. bun run build            -> ok
4. ./scripts/build-keyflow-app.sh  -> dist/KeyFlow.app
5. ./scripts/pack-keyflow-dmg.sh   -> dist/KeyFlow.dmg
6. Manual: relaunch app x2 (màu avatar), toggle auto-prime, switch khi Codex tắt/mở, Cancel khi đang add
```

Ước lượng tổng: ~2.5 giờ. Thứ tự A → B → C → D, mỗi batch 1 commit:
- `fix(core): harden error paths in usage/session services`
- `fix(mac): stable avatar hash, model-backed autoPrime, safe cancel`
- `fix(session): restart codex only when it was running`
- `docs: add MIT license, document relogin/prime, codesign note`
