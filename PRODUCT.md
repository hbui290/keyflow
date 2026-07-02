# Product Requirement Document (PRD) - Codex Switch (KeyFlow)

## 1. Overview & Vision

**Codex Switch** (thương hiệu thương mại: **KeyFlow**) là giải pháp quản lý đa tài khoản chuyên nghiệp dành cho lập trình viên sử dụng ứng dụng Codex Desktop (ChatGPT client) trên hệ điều hành macOS. 

Nhiều lập trình viên sở hữu nhiều tài khoản ChatGPT (Plus, Team, Enterprise) nhằm tối ưu hóa giới hạn tin nhắn (rate limits). Tuy nhiên, Codex Desktop gốc không hỗ trợ tính năng chuyển đổi tài khoản, buộc người dùng phải đăng xuất và đăng nhập lại một cách thủ công vô cùng phiền phức. 

**Codex Switch** giải quyết triệt để nỗi đau này bằng cách cung cấp cơ chế chuyển đổi tài khoản chỉ với 1-Click thông qua 3 giao diện tương tác:
* **CLI (Command Line Interface)**: Dành cho những lập trình viên thích thao tác nhanh trong terminal.
* **TUI (Terminal User Interface)**: Giao diện trực quan ngay trên terminal để duyệt và switch nhanh.
* **Native macOS Status Bar App (KeyFlowMac)**: Ứng dụng menu bar cao cấp, chạy nền, cung cấp khả năng chẩn đoán tức thì và giao diện chuyển đổi mượt mà.

---

## 2. Target Users & Use Cases

* **Đối tượng người dùng**: Các kỹ sư phần mềm, lập trình viên sử dụng Codex/ChatGPT thường xuyên trong công việc hàng ngày trên macOS. Họ sở hữu từ 2 tài khoản ChatGPT trở lên để tránh bị nghẽn giới hạn tin nhắn (Rate Limit).
* **Mục tiêu cốt lõi**:
  * Nhận biết tài khoản nào đang hoạt động (**In use**) và tình trạng giới hạn tin nhắn (5H, Weekly) của nó chỉ trong 1 giây.
  * Chuyển đổi tài khoản cực kỳ an toàn mà không làm mất phiên làm việc.
  * Đồng bộ ngược phiên làm việc từ KeyFlow sang Codex khi Codex bị logout.
  * Nhận diện tài khoản lỗi và yêu cầu đăng nhập lại (**Re-login**) trực quan.

---

## 3. Product Architecture & Core Tech Stack

Kiến trúc dự án được phân chia thành 2 lớp rõ rệt, kết nối với nhau qua cơ chế IPC (Inter-Process Communication):

### 3.1 Backend Core (TypeScript / Bun)
Chịu trách nhiệm xử lý logic hệ thống, đọc ghi tệp và tương tác với các endpoint API của OpenAI.
* **ProfileService**: 
  * Quản lý trạng thái ứng dụng tại tệp `state.json`.
  * Chuẩn hóa dữ liệu đầu vào và đầu ra qua hàm `sanitizeState()`, bảo vệ tính toàn vẹn của các cấu trúc dữ liệu mới như `rateLimitResets`.
  * Quản lý đường dẫn profile độc lập dưới dạng thư mục con để lưu trữ cookie/auth.
* **SessionService**:
  * Thực hiện ghi đè tệp tin `auth.json` của Codex để đồng bộ cấu hình đăng nhập.
  * Sử dụng AppleScript để tắt và khởi chạy lại ứng dụng Codex Desktop (`restartCodexDesktopApp`) nhằm áp dụng cache session mới trên RAM.
* **UsageService**:
  * Fetch song song dữ liệu giới hạn tin nhắn 5H và Weekly từ tài khoản.
  * Tích hợp gọi API OpenAI `/backend-api/wham/rate-limit-reset-credits` để trích xuất chỉ số lượt khôi phục rate limit khả dụng (`rateLimitResets`).

### 3.2 Frontend Layer (Swift / SwiftUI - KeyFlowMac)
Ứng dụng native chạy trên thanh menu bar của macOS:
* **KeyFlowBridgeClient**: Cầu nối giao tiếp IPC gửi lệnh thực thi Bun CLI và phân tích kết quả trả về dạng JSON.
* **Popover View**: 
  * **MenuHeaderView**: Khu vực cao nhất, hiển thị thông tin tài khoản đang active hiện tại, email, trạng thái hoạt động (**`In use`**), và chỉ số lượt đặt lại rate limit (**`resets`**). Kèm theo đó là hệ thống nút điều khiển nhanh (Refresh, Add, Settings, Power).
  * **Usage Section**: Vẽ 2 thanh tiến trình (Progress Bar) tỏa sáng (Glow) cho hạn mức 5H và Weekly. Kèm các mốc thời gian reset cụ thể.
  * **Metadata Section**: Bảng key-value mini cân đối hiển thị: thời gian đồng bộ (`SYNCED`), gói tài khoản (`PLAN`) và lượt khôi phục (`RESETS`).
  * **ScrollView List**: Danh sách chứa các tài khoản phụ (inactive) để người dùng chuyển đổi nhanh. Tự động ẩn đi khi chỉ có 1 tài khoản duy nhất để tối ưu giao diện.
* **Manager Window**: Cửa sổ quản lý chi tiết gồm thanh bên (Sidebar) hiển thị danh sách tất cả tài khoản và màn hình chẩn đoán Diagnostics chi tiết (phát hiện lỗi mạng, hết hạn token, Codex unlinked...).

---

## 4. Key Product Features

### 4.1 Quản lý Hồ sơ Đăng nhập (Multi-profile Management)
* Thêm mới tài khoản bằng phương pháp Cookie thông thường hoặc chế độ Device Auth nâng cao.
* Đặt tên gợi nhớ (Label) cho từng tài khoản để dễ phân biệt.
* Tự động gán chữ ký số độc lập (`authSignature`) dựa trên token đăng nhập nhằm tránh hiện tượng profile trùng lặp.

### 4.2 Chuyển đổi siêu tốc (Fast Switch / 1-Click Switch)
* Khi click vào một tài khoản phụ trong danh sách Popover hoặc Manager, hệ thống sẽ thực hiện chuyển đổi phiên dưới đĩa đệm và tự động nạp lại Codex.app.
* Cơ chế khóa nút (Disable action buttons) trong quá trình chuyển đổi để đảm bảo tiến trình chạy bất đồng bộ hoàn thành an toàn, tránh xung đột dữ liệu.

### 4.3 Đồng bộ hóa Codex chủ động (Sync to Codex)
* Tự động phát hiện khi Codex bị đăng xuất (mất tệp `auth.json` gốc) và hiển thị banner chẩn đoán đỏ hoặc đổi nút Active thành **`Sync to Codex`**.
* Chỉ với 1-Click, KeyFlow sẽ copy cưỡng bức phiên làm việc hiện tại đè vào Codex để phục hồi đăng nhập tức thì mà không yêu cầu nhập lại mật khẩu.

### 4.4 Chẩn đoán & Yêu cầu Đăng nhập lại (Diagnostics & Re-login)
* Phát hiện và cập nhật trạng thái lỗi thành `relogin_required` ngay khi phát hiện phiên đăng nhập hết hạn hoặc cookie chết.
* Hiển thị banner cảnh báo đỏ nổi bật cùng nút hành động **`Re-login`**. Khi click vào nút này, hệ thống sẽ mở trình duyệt web hoặc terminal để người dùng hoàn tất đăng nhập lại cho profile đó.

### 4.5 Theo dõi Rate-limit Reset Credits
* Đồng bộ và hiển thị số lượt khôi phục giới hạn tin nhắn khả dụng của ChatGPT Plus/Team (ví dụ: "2 resets").
* Giúp người dùng chủ động đưa ra quyết định switch tài khoản khi tài khoản hiện tại hết lượt hoặc chuẩn bị cạn kiệt.

---

## 5. Do's and Don'ts

* **Nên làm (Do)**:
  * Đảm bảo tính "Glanceability" (nhìn phát hiểu luôn). Giao diện Menu bar phải cực kỳ gọn gàng, tôn vinh dữ liệu sử dụng lên hàng đầu.
  * Giữ cấu trúc dữ liệu lưu trữ sạch sẽ, luôn chạy hàm lọc `sanitizeState()` khi ghi dữ liệu.
  * Đồng bộ phiên đăng nhập an toàn, luôn tạo bản sao lưu (`backupPath`) trước khi ghi đè auth Codex.
* **Không nên làm (Don't)**:
  * Không lặp lại thông tin dư thừa trên UI (như việc hiện email 2 lần kề nhau).
  * Không để các khoảng trống rỗng kỳ cục giữa nhãn và giá trị trên giao diện; sử dụng căn lề thẳng hàng dọc theo chuẩn macOS.
  * Không để lộ bí mật thông tin nhạy cảm của tài khoản trong log hoặc giao diện hiển thị công khai.
