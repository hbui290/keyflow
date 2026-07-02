---
name: KeyFlow Prestige
colors:
  primary: "#1084FF"
  primary-dark: "#007AFF"
  criticalAccent: "#F87171"
  criticalAccent-dark: "#DC2626"
  surface: "#1E1E1E"
  quietText: "#8E8E93"
  hairline: "#FFFFFF"
typography:
  title:
    fontFamily: System
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.2
  body-md:
    fontFamily: System
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
  label-xs:
    fontFamily: System
    fontSize: 9px
    fontWeight: 700
    lineHeight: 1.1
  monospacedDigit:
    fontFamily: SF Pro Text
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.1
rounded:
  sm: 10px
  md: 14px
  lg: 18px
  capsule: 100px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
components:
  progress-bar:
    backgroundColor: "{colors.primary}"
    height: 5px
    rounded: "{rounded.sm}"
  badge-capsule:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary}"
    padding: "6px 1.5px"
    rounded: "{rounded.capsule}"
---

# Design Specification - KeyFlow (Codex Switch)

## Overview

**KeyFlow** sở hữu ngôn ngữ thiết kế tối giản, hiện đại và tập trung hoàn toàn vào dữ liệu sử dụng (**Glanceability**). Giao diện ứng dụng bám sát các nguyên lý thiết kế native của macOS (macOS Native Aesthetic):
* **Utilitarianism**: Tránh xa các yếu tố trang trí dư thừa (slop UI), tập trung cao độ vào việc hiển thị các thông số rate-limit cốt lõi.
* **Tonal Contrast**: Sử dụng màu sắc tương phản cao giữa trạng thái bình thường (xanh dương chủ đạo) và trạng thái khẩn cấp (đỏ báo lỗi).
* **Compact Inspector Layout**: Sắp xếp thông số dạng key-value thẳng hàng dọc tăm tắp, loại bỏ các khoảng trống vô nghĩa trong các ô metadata.

---

## Colors

Hệ màu sắc của KeyFlow được tối ưu hóa cho cả hai chế độ **Light Mode** và **Dark Mode** của macOS:
* **Primary Accent (`primary` / `#1084FF`):** Màu xanh dương của macOS, tượng trưng cho trạng thái hoạt động bình thường, ổn định. Tự động chuyển sang `#007AFF` ở chế độ sáng để đảm bảo độ tương phản.
* **Critical Accent (`criticalAccent` / `#F87171`):** Màu đỏ cảnh báo dành cho các profile bị mất kết nối, lỗi token hoặc hết hạn cookie. Chuyển sang `#DC2626` trong chế độ sáng.
* **Quiet Text (`quietText` / `#8E8E93`):** Màu xám phụ đề dành cho các nhãn chữ in hoa (uppercase labels) và thông tin phụ.
* **Surface (`surface`):** Màu nền bán trong suốt (translucent) đặc trưng của các cửa sổ popover trên macOS.

---

## Typography

Hệ thống font chữ sử dụng bộ font hệ thống của Apple (`SF Pro Text` và `SF Pro Display`) với các vai trò thiết kế:
* **Title (14px, Bold):** Dành cho email tài khoản hoặc label ở phần Header Popover.
* **Body-md (12px, Medium):** Dành cho giá trị của gói cước, trạng thái hoạt động.
* **Label-xs (9px, Bold, Uppercase):** Dành cho các nhãn tiêu đề nhỏ (`SYNCED`, `PLAN`, `RESETS`).
* **Monospaced Digit (11px, SemiBold):** Dành cho các con số, phần trăm và thời gian đếm ngược để tránh hiện tượng nhảy ký tự khi chữ số thay đổi.

---

## Layout

Cấu trúc chia layout được tối ưu hóa cho không gian hẹp (Menu Bar Popover có chiều rộng cố định `384pt`):
* **Vertical Alignment (Inspector Grid):**
  * Trong bảng chi tiết, cột Metadata bên phải sử dụng layout căn thẳng hàng dọc. 
  * Cột nhãn có chiều rộng cố định **`52pt`**, căn lề trái.
  * Cột giá trị nằm kế bên với khoảng cách **`8pt`**, căn lề trái. Điều này giúp các thông số gióng thẳng hàng dọc một cách hoàn mỹ, không tạo khoảng trống rỗng kỳ cục ở giữa.
* **Spacing Scale:**
  * `xs` (4px) cho khoảng cách nhãn con.
  * `sm` (8px) cho khoảng cách ngang giữa các nút và icon.
  * `md` (12px) cho spacing dọc giữa các khối thông tin nhỏ.
  * `lg` (16px) cho padding mép ngoài của các panel.

---

## Elevation & Depth

* Không lạm dụng hiệu ứng đổ bóng (Drop Shadows) nặng nề gây visual noise.
* Độ sâu được tạo ra bằng các đường viền siêu mỏng độ tương phản thấp (`white.opacity(0.10)` hoặc `black.opacity(0.10)`) và các mảng nền tối (`primary.opacity(0.02)`).

---

## Shapes

* Các cửa sổ Popover và Manager sử dụng corner radius mềm mại theo tiêu chuẩn macOS mới:
  * **Avatar & Status Dots:** Tròn hoàn hảo (`full`).
  * **Badges / Pills:** Dạng `Capsule` bo tròn 2 đầu.
  * **Panel nền:** Corner radius **`12px`** hoặc **`14px`** (`rounded.md`).

---

## Components

### 1. Progress Bar (GlowProgressBar)
Thanh tiến trình hiển thị mức độ cạn kiệt hạn ngạch tin nhắn:
* Chiều cao mặc định **`5px`**, bo tròn đầu.
* Có hiệu ứng tỏa sáng nhẹ (Glow overlay) ở phía dưới thanh khi tài khoản đang active để tạo điểm nhấn thị giác cao cấp.

### 2. Capsule Badge (Resets Pill)
Hộp hiển thị số lượt khôi phục rate limit còn lại:
* Sử dụng hình dáng Capsule.
* Nền có màu xanh nhạt `primary.opacity(0.10)`, viền mỏng màu xanh `primary.opacity(0.22)`, chữ và icon màu xanh đậm để tạo cảm giác tinh tế, cao cấp.

---

## Do's and Don'ts

* **Nên làm (Do)**:
  * Do căn lề trái thẳng hàng tăm tắp cho cả nhãn và giá trị của các thông số kỹ thuật.
  * Do viết hoa toàn bộ (uppercase) các nhãn phụ đề nhỏ (`SYNCED`, `PLAN`, `RESETS`).
  * Do ẩn các panel danh sách phụ khi không có phần tử để thu gọn không gian menu bar.
* **Không nên làm (Don't)**:
  * Don't sử dụng `Spacer()` để đẩy nhãn và giá trị sang hai rìa xa nhau khi chiều rộng khung hẹp, gây rời rạc giao diện.
  * Don't lạm dụng các icon màu sắc sặc sỡ bên ngoài màu accent chủ đạo.
  * Don't thay đổi font chữ hệ thống sang font serif hoặc font có độ rộng ký tự biến đổi cho các dãy số đếm ngược thời gian.
