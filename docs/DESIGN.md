---
name: KeyFlow Prestige
colors:
  primary: "#1084FF"
  primary-dark: "#0055B3"
  primary-container: "#E8F2FF"
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
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.primary-dark}"
    padding: "6px 1.5px"
    rounded: "{rounded.capsule}"
  error-banner:
    backgroundColor: "{colors.criticalAccent-dark}"
    textColor: "{colors.hairline}"
    rounded: "{rounded.sm}"
  diagnostics-icon:
    textColor: "{colors.criticalAccent}"
  metadata-label:
    textColor: "{colors.quietText}"
    typography: "{typography.label-xs}"
  avatar-border:
    textColor: "{colors.hairline}"
    rounded: "{rounded.sm}"
---

# Design Specification — KeyFlow

## Overview

**KeyFlow** adopts a minimalist, highly focused visual language centered around data accessibility (**Glanceability**). The interface aligns with native macOS UI design patterns:
* **Utilitarianism**: Rejects unnecessary decorative items (slop UI), keeping the interface clean and highlighting core rate-limit metrics.
* **Tonal Contrast**: Uses stark visual cues to separate normal operations (blue theme) from critical warnings (red error alerts).
* **Compact Inspector Layout**: Features vertical, grid-aligned key-value pairs to prevent awkward gaps between metadata.

---

## Colors

Colors adapt dynamically between macOS **Light Mode** and **Dark Mode**:
* **Primary Accent (`primary` / `#1084FF`):** The system blue accent representing healthy, active configurations.
* **Primary Dark (`primary-dark` / `#0055B3`):** Darker blue variant for text overlays on light backgrounds to pass contrast checks.
* **Primary Container (`primary-container` / `#E8F2FF`):** Soft blue tint fill for container backgrounds.
* **Critical Accent (`criticalAccent` / `#F87171`):** A warning red tone indicating unlinked configurations.
* **Critical Dark (`criticalAccent-dark` / `#DC2626`):** Solid red background fill for high contrast layouts.
* **Quiet Text (`quietText` / `#8E8E93`):** Neutral gray tones designated for uppercase labels and supplementary notes.
* **Surface (`surface`):** Translucent background overlays representing standard macOS popover canvases. In implementation this resolves to the system's dynamic `windowBackgroundColor` rather than the static `#1E1E1E` token, so it adapts automatically between Light and Dark Mode — the token value documents the dark-mode baseline this was designed against.

> **Note on accent hues**: `KeyFlowBridgeClient`/`Views.swift` render `primary` and `primary-dark` using `NSColor` matched against the system appearance (Apple's system blue, `#007AFF`/`#0A84FF`) rather than these exact hex values. The two are visually near-identical; the tokens above capture design intent, not a pixel-exact runtime guarantee.

---

## Typography

Text elements utilize Apple's system fonts (`SF Pro Text` and `SF Pro Display`) mapped to distinct UI roles:
* **Title (14px, Bold):** Used for profile display names or email addresses in the Header.
* **Body-md (12px, Medium):** Used for status messages and plan details.
* **Label-xs (9px, Bold, Uppercase):** Used for metadata labels (`SYNCED`, `PLAN`, `RESETS`).
* **Monospaced Digit (11px, SemiBold):** Used for counts, percentages, and count-down timers to avoid visual jitter when digits change width.

---

## Layout

Designed specifically for compact menu bar targets (fixed Popover width of `384pt`):
* **Vertical Alignment (Inspector Grid):**
  * The right-hand system metadata panel aligns labels and values left-justified.
  * The label column is locked at a fixed width of **`52pt`**, aligned left.
  * The value column is aligned left right next to it, separated by an **`8pt`** gap. This creates a clean inspector layout and eliminates large gaps.
* **Spacing Scale:**
  * `xs` (4px) for minor sub-label gaps.
  * `sm` (8px) for horizontal item padding.
  * `md` (12px) for vertical gaps between card sections.
  * `lg` (16px) for main panel margins.

---

## Elevation & Depth

* Rejects heavy drop shadows that introduce visual noise.
* Depth is established via low-contrast thin borders (`white.opacity(0.10)` or `black.opacity(0.10)`) and subtle dark background layers (`primary.opacity(0.02)`).

---

## Shapes

Popover and Manager corners adhere to macOS guidelines:
* **Avatar & Status Dots:** Circled (`full`).
* **Badges / Pills:** Double-rounded `Capsule`.
* **Panels:** Rounded corner radius of **`12px`** or **`14px`** (`rounded.md`).

---

## Components

### 1. Progress Bar (GlowProgressBar)
Visual representation of rate limit consumption:
* Height set to **`5px`** with fully rounded caps.
* Includes a subtle glow overlay beneath active account bars to emphasize significance.

### 2. Capsule Badge (Resets Pill)
Displays remaining rate limit reset credits:
* Uses a compact capsule shape.
* Filled with a light blue background (`primary.opacity(0.10)`), surrounded by a thin outline (`primary.opacity(0.22)`), with text and icon colored in rich blue to feel premium.

---

## Do's and Don't's

* **Do's**:
  * Do align both labels and values left-justified in metadata rows.
  * Do capitalize all sub-panel headers (`SYNCED`, `PLAN`, `RESETS`).
  * Do collapse the bottom list panel entirely if no secondary profiles exist to save space.
* **Don'ts**:
  * Don't use `Spacer()` to push labels and values to opposite extremes when margins are narrow.
  * Don't use saturated, non-accent colors for general symbols.
  * Don't change the system monospaced digit font for count-down numbers.
