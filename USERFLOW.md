# User Flows & Interactions Guide - KeyFlow (Codex Switch)

Tài liệu này đặc tả chi tiết toàn bộ các luồng tương tác (User Flows), kịch bản phản hồi giao diện, và các điểm chạm hệ thống của ứng dụng **KeyFlow** trên macOS.

---

## Flow 1: Thêm tài khoản mới (Add Account Flow)

Luồng tương tác khi người dùng muốn đưa một tài khoản ChatGPT mới vào hệ thống quản lý.

```mermaid
sequenceDiagram
    actor User as Người dùng
    participant UI as Giao diện SwiftUI (Manager)
    participant CLI as KeyFlow Bridge (TypeScript)
    participant API as OpenAI Wham API

    User->>UI: Bấm nút "Add Account" (+)
    UI->>User: Hiện Modal yêu cầu nhập Label & chọn phương thức (Cookie / Device Auth)
    User->>UI: Điền thông tin và bấm "Submit"
    UI->>CLI: Gọi lệnh CLI: kfl add --label <label> [--device-auth]
    CLI->>API: Xác thực token và lấy thông tin tài khoản
    API-->>CLI: Trả về email & hạn mức sử dụng (nếu thành công)
    
    alt Xác thực thành công
        CLI->>CLI: Tạo thư mục profile mới & Lưu auth.json
        CLI->>CLI: Tính toán chữ ký số authSignature từ ID Token & Email
        CLI->>CLI: Ghi thông tin tài khoản vào state.json
        CLI-->>UI: Trả về trạng thái SUCCESS kèm thông tin Account
        UI-->>User: Đóng modal, hiển thị tài khoản mới trong danh sách
    else Xác thực thất bại
        CLI-->>UI: Trả về lỗi (Token hết hạn / Sai định dạng)
        UI-->>User: Hiện Banner cảnh báo đỏ chứa thông tin lỗi chi tiết
    end
```

---

## Flow 2: Chuyển đổi tài khoản (Switch / Use Account Flow)

Luồng hoạt động khi người dùng kích hoạt chuyển đổi phiên đăng nhập từ tài khoản hiện tại sang tài khoản khác.

```mermaid
sequenceDiagram
    actor User as Người dùng
    participant Pop as Menu Bar Popover
    participant CLI as KeyFlow Bridge (TypeScript)
    participant Codex as Codex Desktop (Electron App)

    User->>Pop: Click chọn Tài khoản B (đang Inactive ở danh sách dưới)
    Pop->>Pop: Khóa toàn bộ tương tác trên UI (Disable buttons), hiển thị Spinner
    Pop->>CLI: Gọi lệnh CLI: kfl use --account <id-B>
    
    CLI->>CLI: Đọc file state.json, lấy thư mục profile của B
    CLI->>CLI: Tạo bản sao lưu backup cho auth.json hiện tại của Codex (nếu có)
    CLI->>CLI: Copy file auth.json của B ghi đè vào auth.json của Codex Desktop
    
    CLI->>Codex: Gọi AppleScript tắt ứng dụng Codex Desktop
    CLI->>Codex: Gọi AppleScript khởi chạy lại Codex Desktop (áp dụng session mới)
    
    CLI->>CLI: Cập nhật activeAccountId = B trong state.json
    CLI-->>Pop: Trả về trạng thái SUCCESS của tài khoản B
    Pop->>Pop: Cập nhật Header thành tài khoản B, chuyển A xuống danh sách phụ
    Pop->>Pop: Mở khóa tương tác UI
    Pop-->>User: Hoàn tất chuyển đổi mượt mà
```

---

## Flow 3: Đồng bộ ngược cưỡng bức (Sync to Codex Flow)

Kịch bản cứu hộ khi ứng dụng Codex Desktop bị đăng xuất ngoài ý muốn (mất file auth) nhưng KeyFlow vẫn đang lưu session hoạt động của tài khoản đó.

```mermaid
sequenceDiagram
    actor User as Người dùng
    participant Pop as Menu Bar Popover
    participant CLI as KeyFlow Bridge (TypeScript)
    participant Codex as Codex Desktop (Electron App)

    Note over CLI: Tự động chạy nền kiểm tra định kỳ
    CLI->>CLI: Phát hiện file auth.json của Codex bị mất / unlinked
    CLI->>CLI: Cập nhật status = relogin_required vào state.json
    CLI-->>Pop: Cập nhật UI Popover
    Pop->>Pop: Hiện banner lỗi đỏ "Codex unlinked"
    Pop->>Pop: Kích hoạt nút "Sync to Codex" (Xoay vòng) thay cho nút Switch bình thường
    
    User->>Pop: Click nút "Sync to Codex"
    Pop->>Pop: Khóa tương tác UI, hiện spinner
    Pop->>CLI: Gọi lệnh switchAccount cưỡng bức
    CLI->>CLI: Đọc auth.json lưu trữ trong thư mục profile của tài khoản active
    CLI->>CLI: Ghi đè file này vào thư mục của Codex Desktop
    CLI->>Codex: Restart Codex.app qua AppleScript
    CLI-->>Pop: Trả về SUCCESS
    Pop->>Pop: Ẩn banner lỗi đỏ, chuyển khiên diagnostics sang màu xanh
    Pop-->>User: Codex đăng nhập lại tự động thành công
```

---

## Flow 4: Đăng nhập lại khi hết hạn phiên (Re-login Flow)

Luồng tương tác khi một tài khoản phụ bị hết hạn token (Cookie chết, đổi mật khẩu) và cần đăng nhập lại để cập nhật phiên.

```mermaid
sequenceDiagram
    actor User as Người dùng
    participant Pop as Menu Bar Popover
    participant CLI as KeyFlow Bridge (TypeScript)

    Note over CLI: Fetch API OpenAI trả về 401 Unauthorized
    CLI->>CLI: Cập nhật trạng thái tài khoản thành "relogin_required" trong state.json
    CLI-->>Pop: Cập nhật UI
    Pop->>Pop: Đổi nút Switch bình thường thành nút màu đỏ "Re-login"
    
    User->>Pop: Click nút "Re-login"
    Pop->>CLI: Kích hoạt tiến trình reloginAccount
    CLI->>User: Mở cửa sổ Web / Terminal tương tác để đăng nhập lại
    User->>CLI: Hoàn tất đăng nhập và lấy Cookie/Token mới
    CLI->>CLI: Cập nhật auth.json mới & reset status = ok
    CLI-->>Pop: Đồng bộ UI thành công
    Pop->>Pop: Khôi phục nút chuyển đổi bình thường
```

---

## Flow 5: Tra cứu hạn mức và lượt reset (Check Usage & Resets)

Luồng đồng bộ dữ liệu sử dụng theo thời gian thực (5H, Weekly, Resets remaining) từ OpenAI về giao diện.

```mermaid
sequenceDiagram
    participant CLI as KeyFlow Backend
    participant API as OpenAI API Endpoints
    participant UI as Giao diện SwiftUI

    Note over CLI: Chạy nền định kỳ hoặc khi người dùng bấm "Refresh"
    CLI->>API: Gọi song song:
    Note over CLI: 1. API Hạn mức 5H / Weekly
    Note over CLI: 2. API Reset Credits (/wham/rate-limit-reset-credits)
    API-->>CLI: Trả về thông số hạn mức và lượt đặt lại khả dụng (ví dụ: available_count = 2)
    CLI->>CLI: Gọi sanitizeState() bảo lưu trường rateLimitResets
    CLI->>CLI: Ghi đè cập nhật vào state.json
    CLI-->>UI: Gửi dữ liệu qua Bridge IPC
    UI->>UI: Cập nhật 2 thanh tiến trình (Glow)
    UI->>UI: Cập nhật nhãn "In use • 2 resets" ở Popover Header
    UI->>UI: Cập nhật bảng Inspector ở Detail View (RESETS: 2)
```
