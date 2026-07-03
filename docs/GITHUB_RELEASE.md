# Hướng dẫn Cấu hình GitHub & Phát hành Phiên bản v1.0.0

Tài liệu này chứa thông tin đặc tả dùng để điền vào phần **About** của GitHub Repository và nội dung ghi chú phát hành (**Release Notes**) cho phiên bản đầu tiên của KeyFlow.

---

## 1. Thông tin cấu hình Repository (About Section)

Boss nhấn vào biểu tượng bánh răng ⚙️ ở góc phải mục **About** trên trang chủ GitHub và điền các thông tin sau:

* **Description**:
  > A premium macOS status bar app and CLI tool for seamless, 1-click multi-account switching and quota management on Codex Desktop (ChatGPT Client).
* **Website**:
  *(Có thể để trống hoặc điền link trang cá nhân/landing page của Boss)*
* **Topics (Thẻ từ khóa)**:
  > `macos-app`, `chatgpt-client`, `codex`, `typescript`, `swift`, `multi-account`, `bun-runtime`, `cli-tool`, `productivity-tool`

---

## 2. Nội dung phát hành phiên bản (Release Notes - v1.0.0)

Khi tạo Release đầu tiên trên GitHub (nhấn **Create a new release**), Boss đặt thẻ tag là `v1.0.0`, tiêu đề release là `KeyFlow v1.0.0 - Initial Release`, sau đó sao chép nội dung Markdown dưới đây và tải tệp tin `dist/KeyFlow.dmg` lên phần đính kèm (Assets).

### Nội dung Copy-Paste:

```markdown
# KeyFlow v1.0.0 - Multi-Account Switcher for Codex Desktop

We are excited to announce the initial release of **KeyFlow** (Codex Switch), a native macOS menu bar application and developer CLI tool designed to solve rate-limiting issues by allowing seamless, 1-click swapping between multiple ChatGPT/Codex accounts.

---

## ✨ Features

- **Fluid Status Bar App**: Runs silently in the macOS menu bar, showing active account usage metrics at a glance.
- **Fast CLI Command (`kfl`)**: Quick profile switching and session refresh commands designed for terminal-heavy workflows.
- **Automatic Token Rotation**: Automatically rotates expired tokens and syncs credentials back to Codex.
- **Auto-Priming Engine**: Keeps the 5-hour ChatGPT session window active by sending a minimal background message when the quota resets.
- **Zero-Dependency Bundle**: App installer DMG comes bundled with all necessary binaries. No Node.js or Bun installation is required on the user's system.
- **POSIX Compliant Security**: Restricts directory and configuration permissions (`0700` and `0600`) to guarantee data safety.

---

## 🚀 Installation & Usage

1. Download **`KeyFlow.dmg`** from the assets below.
2. Open the DMG file and drag **`KeyFlow`** to your **`Applications`** folder.
3. Open the app from your Applications. KeyFlow will run silently in your menu bar.
4. Use the interface or the `kfl` CLI binary in `dist/kfl` to start managing profiles.

---

## 📄 License & Specifications

Distributed under the **MIT License**. For complete developer architecture, see the following:
- [PRODUCT.md](docs/PRODUCT.md): Vision and Use Cases.
- [USERFLOW.md](docs/USERFLOW.md): Sequence diagrams for authentication and priming.
- [DESIGN.md](docs/DESIGN.md): Visual design tokens and HIG guidelines.
- [AGENTS.md](AGENTS.md): Coding guidelines for AI-assisted development.
```
