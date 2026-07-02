import AppKit
import SwiftUI

private let criticalUsageThreshold = 5.0

private enum CodexVisual {
    static let radiusSM: CGFloat = 10
    static let radiusMD: CGFloat = 14
    static let radiusLG: CGFloat = 18

    static let surface = Color(nsColor: .windowBackgroundColor)
    static let hairline = Color.primary.opacity(0.10)
    static let quietText = Color.secondary.opacity(0.86)
    static var neutralAccent: Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            if appearance.bestMatch(from: [.darkAqua, .vibrantDark]) != nil {
                return NSColor(red: 10/255, green: 132/255, blue: 255/255, alpha: 1.0)
            } else {
                return NSColor(red: 0/255, green: 122/255, blue: 255/255, alpha: 1.0)
            }
        })
    }
    static var criticalAccent: Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            if appearance.bestMatch(from: [.darkAqua, .vibrantDark]) != nil {
                return NSColor(red: 248/255, green: 113/255, blue: 113/255, alpha: 1.0)
            } else {
                return NSColor(red: 220/255, green: 38/255, blue: 38/255, alpha: 1.0)
            }
        })
    }
}

@MainActor
private enum CodexFormatters {
    static let relativeTimestamp: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter
    }()

    static let resetDateTime = Date.FormatStyle(date: .abbreviated, time: .shortened)
    static let resetDate = Date.FormatStyle(date: .abbreviated, time: .omitted)
    static let resetTime = Date.FormatStyle(date: .omitted, time: .shortened)
}

struct PremiumPanel<Content: View>: View {
    var cornerRadius: CGFloat = CodexVisual.radiusMD
    var padding: CGFloat = 14
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Color.primary.opacity(0.045))
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .strokeBorder(CodexVisual.hairline)
                    )
            )
    }
}

struct SectionDivider: View {
    var body: some View {
        Rectangle()
            .fill(
                LinearGradient(
                    colors: [
                        Color.primary.opacity(0.04),
                        Color.primary.opacity(0.16),
                        Color.primary.opacity(0.04),
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .frame(height: 1)
    }
}

@MainActor
func makeRuntimeAppIcon(size: CGFloat = 512) -> NSImage? {
    let renderer = ImageRenderer(content:
        AppGlyph(size: size)
            .padding(size * 0.08)
    )
    renderer.scale = 2
    if let image = renderer.nsImage {
        image.size = NSSize(width: size, height: size)
        return image
    }
    return nil
}

struct AppGlyph: View {
    var size: CGFloat = 13

    var body: some View {
        if let nsImage = NSImage(named: "AppGlyph") {
            Image(nsImage: nsImage)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
        } else {
            // High-quality fallback minimalist blue background with white K
            ZStack {
                RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
                    .fill(Color(red: 0.145, green: 0.388, blue: 0.922)) // #2563EB
                Text("K")
                    .font(.system(size: size * 0.6, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }
            .frame(width: size, height: size)
        }
    }
}

func statusColor(for account: BridgeAccountSummary?) -> Color {
    guard let account else { return CodexVisual.neutralAccent.opacity(0.42) }

    switch account.usage.status {
    case .ok:
        if let remaining = account.fiveHourRemaining, remaining <= criticalUsageThreshold {
            return CodexVisual.criticalAccent
        }
        return CodexVisual.neutralAccent
    case .stale:
        return CodexVisual.neutralAccent
    case .error, .reloginRequired:
        return CodexVisual.neutralAccent
    case .never:
        return CodexVisual.neutralAccent.opacity(0.42)
    }
}

func usageBarColor(for remainingPercent: Double?) -> Color {
    guard let remainingPercent else { return CodexVisual.neutralAccent.opacity(0.42) }

    if remainingPercent <= criticalUsageThreshold {
        return CodexVisual.criticalAccent
    }
    return CodexVisual.neutralAccent
}

func percentString(_ value: Double?) -> String {
    guard let value else { return "n/a" }
    return value.percentText
}

func statusBarNumberString(_ value: Double?) -> String {
    guard let value else { return "n/a" }
    return "\(Int(value.rounded()))"
}

@MainActor
func relativeTimestamp(from milliseconds: Double?) -> String {
    guard let date = dateFromMillis(milliseconds) else { return "Never" }
    return CodexFormatters.relativeTimestamp.localizedString(for: date, relativeTo: Date())
}

@MainActor
func resetTimestamp(from seconds: Double?) -> String {
    guard let date = dateFromSeconds(seconds) else { return "n/a" }
    return date.formatted(CodexFormatters.resetDateTime)
}

@MainActor
func resetTime(from seconds: Double?) -> String {
    guard let date = dateFromSeconds(seconds) else { return "n/a" }
    return date.formatted(CodexFormatters.resetTime)
}

@MainActor
func resetDate(from seconds: Double?) -> String {
    guard let date = dateFromSeconds(seconds) else { return "n/a" }
    return date.formatted(CodexFormatters.resetDate)
}

func timeRemaining(until seconds: Double?, now: Date) -> String {
    guard let date = dateFromSeconds(seconds) else { return "n/a" }
    if date <= now { return "now" }

    let components = Calendar.current.dateComponents([.hour, .minute], from: now, to: date)
    let hours = components.hour ?? 0
    let minutes = components.minute ?? 0

    if hours > 0 {
        return "\(hours)h \(minutes)m"
    }
    return "\(max(minutes, 0))m"
}

func statusNote(for account: BridgeAccountSummary?) -> String {
    guard let account else { return "No account" }

    switch account.usage.status {
    case .ok:
        return "Ready"
    case .stale:
        return "Stale"
    case .error:
        return account.isBlocked ? "Unavailable" : "Error"
    case .reloginRequired:
        return "Re-login required"
    case .never:
        return "Refresh needed"
    }
}

func visibleStatusNote(for account: BridgeAccountSummary?) -> String? {
    let note = statusNote(for: account)
    return note == "Ready" ? nil : note
}

func menuPopoverHeight(accountCount: Int, showsBanner: Bool) -> CGFloat {
    let rowHeight: CGFloat = 60
    let dividerHeight: CGFloat = 9
    let accountsHeight: CGFloat

    if accountCount == 0 {
        accountsHeight = 90
    } else {
        let naturalHeight = (CGFloat(accountCount) * rowHeight) + (CGFloat(max(accountCount - 1, 0)) * dividerHeight)
        accountsHeight = min(240, naturalHeight)
    }

    let bannerHeight: CGFloat = showsBanner ? 52 : 0
    let baseHeight: CGFloat = 268 // 32 + 160 + 28 + 1 + 39 + 8 buffer
    let height = baseHeight + bannerHeight + accountsHeight
    return min(820, max(320, height))
}

struct RelativeTimestampText: View {
    let prefix: String
    let milliseconds: Double?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { _ in
            Text("\(prefix)\(relativeTimestamp(from: milliseconds))")
        }
    }
}

struct TimeRemainingText: View {
    let prefix: String
    let seconds: Double?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { context in
            Text("\(prefix)\(timeRemaining(until: seconds, now: context.date))")
        }
    }
}

struct CompactUsageBar: View {
    let percent: Double?
    let color: Color
    var height: CGFloat = 6

    var body: some View {
        let normalized = max(0, min((percent ?? 0) / 100, 1))

        Capsule()
            .fill(Color.primary.opacity(0.18))
            .overlay(
                Capsule()
                    .strokeBorder(Color.primary.opacity(0.12))
            )
            .overlay(alignment: .leading) {
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [
                                color.opacity(0.92),
                                color,
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .scaleEffect(x: normalized, y: 1, anchor: .leading)
            }
        .frame(height: height)
        .accessibilityLabel("Remaining five-hour usage")
    }
}

struct UsageLane: View {
    let label: String
    let percent: Double?

    var body: some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundStyle(CodexVisual.quietText)
                .frame(width: 24, alignment: .leading)

            CompactUsageBar(percent: percent, color: usageBarColor(for: percent), height: 5)
                .frame(height: 5)

            Text(percentString(percent))
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.primary.opacity(0.82))
                .frame(width: 42, alignment: .trailing)
        }
    }
}

struct DualUsageView: View {
    let fiveHour: Double?
    let weekly: Double?
    var spacing: CGFloat = 7

    var body: some View {
        VStack(spacing: spacing) {
            UsageLane(label: "5H", percent: fiveHour)
            UsageLane(label: "WK", percent: weekly)
        }
    }
}

struct StatusDot: View {
    let color: Color
    var size: CGFloat = 8

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .overlay(
                Circle()
                    .strokeBorder(Color.white.opacity(0.28), lineWidth: 0.75)
            )
    }
}

struct KeyValueRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
        }
        .font(.caption)
    }
}

struct PercentPill: View {
    let label: String
    let value: Double?

    var body: some View {
        HStack(spacing: 6) {
            Text(label)
                .foregroundStyle(CodexVisual.quietText)
            Text(percentString(value))
                .foregroundStyle(.primary)
        }
        .font(.system(size: 11, weight: .semibold, design: .rounded))
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.86)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(minWidth: 64)
        .background(
            Capsule(style: .continuous)
                .fill(Color.primary.opacity(0.065))
                .overlay(
                    Capsule(style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.06))
                )
        )
    }
}

struct AccountUsageMeter: View {
    let label: String
    let value: Double?

    var body: some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundStyle(CodexVisual.quietText)
                .frame(width: 20, alignment: .leading)

            CompactUsageBar(percent: value, color: usageBarColor(for: value), height: 4)
                .frame(width: 42, height: 4)

            Text(percentString(value))
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.82)
                .foregroundStyle(.primary.opacity(0.84))
                .frame(width: 38, alignment: .trailing)
        }
        .frame(width: 118, alignment: .trailing)
    }
}

struct AccountUsageStack: View {
    let fiveHour: Double?
    let weekly: Double?

    var body: some View {
        VStack(alignment: .trailing, spacing: 7) {
            AccountUsageMeter(label: "5H", value: fiveHour)
            AccountUsageMeter(label: "WK", value: weekly)
        }
    }
}

struct IconCommandButton: View {
    let title: String
    let systemImage: String
    var role: ButtonRole?
    var isProminent = false
    let action: () -> Void

    var body: some View {
        Button(role: role, action: action) {
            Label(title, systemImage: systemImage)
                .labelStyle(.iconOnly)
                .font(.system(size: 12, weight: .semibold))
                .frame(width: 28, height: 28)
                .background(
                    Circle()
                        .fill(isProminent ? CodexVisual.neutralAccent.opacity(0.18) : Color.primary.opacity(0.055))
                        .overlay(
                            Circle()
                                .strokeBorder(isProminent ? CodexVisual.neutralAccent.opacity(0.30) : Color.primary.opacity(0.07))
                        )
                )
        }
        .buttonStyle(.plain)
        .help(title)
    }
}

struct ManagerMetricCard<ValueContent: View, NoteContent: View>: View {
    let title: String
    var tint: Color = CodexVisual.neutralAccent
    @ViewBuilder let valueContent: () -> ValueContent
    @ViewBuilder let noteContent: () -> NoteContent

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(CodexVisual.quietText)
                    .textCase(.uppercase)
                Spacer()
                Circle()
                    .fill(tint.opacity(0.86))
                    .frame(width: 5, height: 5)
            }

            valueContent()
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            noteContent()
                .font(.system(size: 10))
                .foregroundStyle(CodexVisual.quietText)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.primary.opacity(0.035))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.07))
                )
        )
    }
}

struct EmptyStateView: View {
    let title: String
    let detail: String

    var body: some View {
        PremiumPanel(cornerRadius: CodexVisual.radiusMD, padding: 16) {
            VStack(alignment: .leading, spacing: 9) {
                Image(systemName: "person.crop.circle.badge.plus")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(CodexVisual.neutralAccent)
                Text(title)
                    .font(.title3.weight(.semibold))
                Text(detail)
                    .font(.callout)
                    .foregroundStyle(CodexVisual.quietText)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct StatusBarLabelView: View {
    @EnvironmentObject private var model: KeyFlowAppModel

    var body: some View {
        let account = model.activeAccount
        let remaining = account?.fiveHourRemaining
        let tint = statusBarUsageColor(for: remaining)

        ZStack {
            StatusBarBatteryMeter(percent: remaining, fill: tint, height: 10)
                .frame(width: 30, height: 10)
                .frame(maxWidth: .infinity, alignment: .center)
                .accessibilityLabel("Remaining five-hour usage")
                .accessibilityValue(percentString(remaining))
                .opacity(model.currentOperation == nil ? 1 : 0)

            if model.currentOperation != nil {
                ProgressView()
                    .controlSize(.small)
                    .scaleEffect(0.70)
                    .background(
                        Capsule(style: .continuous)
                            .fill(Color.primary.opacity(0.18))
                            .frame(width: 30, height: 12)
                    )
            }
        }
        .frame(maxWidth: .infinity, minHeight: 14, alignment: .center)
    }
}

struct StatusBarBatteryMeter: View {
    let percent: Double?
    let fill: Color
    var height: CGFloat = 10

    private var normalizedPercent: CGFloat {
        CGFloat(max(0, min((percent ?? 0) / 100, 1)))
    }

    var body: some View {
        GeometryReader { proxy in
            let percentFillWidth = proxy.size.width * normalizedPercent
            let shape = Capsule(style: .continuous)

            ZStack(alignment: .leading) {
                shape
                    .fill(Color.black.opacity(0.58))
                    .overlay(
                        shape.strokeBorder(Color.white.opacity(0.38), lineWidth: 0.75)
                    )

                shape
                    .fill(
                        LinearGradient(
                            colors: [
                                fill.opacity(0.92),
                                fill,
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: percentFillWidth)
            }
        }
        .frame(height: height)
        .clipShape(Capsule(style: .continuous))
        .accessibilityLabel("Remaining five-hour usage")
        .accessibilityValue(percentString(percent))
    }
}

private func statusBarUsageColor(for remainingPercent: Double?) -> Color {
    guard let remainingPercent else { return Color.primary.opacity(0.18) }

    if remainingPercent <= criticalUsageThreshold {
        return CodexVisual.criticalAccent
    }
    return Color.primary
}

struct BannerView: View {
    let banner: BannerState

    var color: Color {
        switch banner.kind {
        case .info:
            return CodexVisual.neutralAccent
        case .success:
            return CodexVisual.neutralAccent
        case .warning:
            return CodexVisual.neutralAccent
        case .error:
            return CodexVisual.neutralAccent
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: banner.kind == .error ? "exclamationmark.triangle.fill" : "info.circle.fill")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(color)
            Text(banner.message)
                .font(.caption.weight(.medium))
                .foregroundStyle(CodexVisual.quietText)
                .lineLimit(2)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(
            RoundedRectangle(cornerRadius: CodexVisual.radiusSM, style: .continuous)
                .fill(color.opacity(0.10))
                .overlay(
                    RoundedRectangle(cornerRadius: CodexVisual.radiusSM, style: .continuous)
                        .strokeBorder(color.opacity(0.18))
                )
        )
    }
}

struct HeaderMetaItem<ValueContent: View>: View {
    let title: String
    @ViewBuilder let valueContent: () -> ValueContent

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(CodexVisual.quietText.opacity(0.82))
                .textCase(.uppercase)
                .lineLimit(1)

            valueContent()
                .font(.system(size: 12, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.primary.opacity(0.78))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct MenuHeaderView: View {
    @EnvironmentObject private var model: KeyFlowAppModel

    var body: some View {
        let account = model.activeAccount
        let tint = statusColor(for: account)

        PremiumPanel(cornerRadius: CodexVisual.radiusLG, padding: 16) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .center, spacing: 11) {
                    AppGlyph(size: 24)

                    VStack(alignment: .leading, spacing: 3) {
                        Text(account?.displayName ?? "No active account")
                            .font(.system(size: 15, weight: .semibold))
                            .lineLimit(1)
                            .truncationMode(.tail)

                        Text(account?.subtitle ?? "Connect a Codex login")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(CodexVisual.quietText)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    if let note = visibleStatusNote(for: account) {
                        HStack(spacing: 6) {
                            StatusDot(color: tint, size: 7)
                            Text(note)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(.primary.opacity(0.82))
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            Capsule(style: .continuous)
                                .fill(tint.opacity(0.10))
                                .overlay(
                                    Capsule(style: .continuous)
                                        .strokeBorder(tint.opacity(0.16))
                                )
                        )
                    }
                }

                DualUsageView(
                    fiveHour: account?.fiveHourRemaining,
                    weekly: account?.weeklyRemaining,
                    spacing: 9
                )

                HStack(alignment: .top, spacing: 10) {
                    HeaderMetaItem(title: "Updated") {
                        RelativeTimestampText(prefix: "", milliseconds: account?.usage.updatedAt)
                    }
                    HeaderMetaItem(title: "5H Next") {
                        Text(resetTime(from: account?.usage.last5Hours.resetAt))
                    }
                    HeaderMetaItem(title: "WK Reset") {
                        Text(resetDate(from: account?.usage.weekly.resetAt))
                    }
                }
                .padding(.top, 1)

                if let operation = model.currentOperation {
                    HStack(spacing: 8) {
                        ProgressView()
                            .controlSize(.small)
                            .scaleEffect(0.76)
                        Text(operation.subtitle ?? operation.title)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(CodexVisual.quietText)
                            .lineLimit(1)
                    }
                    .padding(.top, 1)
                }
            }
        }
    }
}

struct ActionStripView: View {
    @EnvironmentObject private var model: KeyFlowAppModel
    let openManagerWindow: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button {
                guard !model.isRefreshingAll, !model.hasBlockingOperation else { return }
                Task { await model.refreshAll() }
            } label: {
                ZStack {
                    if model.isRefreshingAll {
                        ProgressView()
                            .controlSize(.small)
                            .scaleEffect(0.72)
                    } else {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 12, weight: .semibold))
                    }
                }
                .font(.system(size: 12, weight: .semibold))
                .frame(width: 28, height: 28)
                .background(
                    Circle()
                        .fill(Color.primary.opacity(0.055))
                        .overlay(
                            Circle()
                                .strokeBorder(Color.primary.opacity(0.07))
                        )
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(model.isRefreshingAll || model.hasBlockingOperation)
            .help("Refresh all accounts")



            IconCommandButton(title: "Add", systemImage: "plus") {
                model.openAddAccountFlow()
                openManagerWindow()
            }
            .disabled(model.hasBlockingOperation)

            IconCommandButton(title: "Manage", systemImage: "slider.horizontal.3", isProminent: true) {
                openManagerWindow()
            }

            Spacer()

            IconCommandButton(title: "Quit", systemImage: "power", role: .destructive) {
                NSApplication.shared.terminate(nil)
            }
        }
    }
}

struct AccountRowView: View {
    let account: BridgeAccountSummary
    @State private var isHovered = false

    var body: some View {
        let tint = statusColor(for: account)

        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 10) {
                    StatusDot(color: account.isActive ? CodexVisual.neutralAccent : Color.primary.opacity(0.16), size: account.isActive ? 8 : 7)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(account.displayName)
                            .font(.system(size: 13, weight: .semibold))
                            .lineLimit(1)
                            .truncationMode(.tail)

                        if let email = account.email, email != account.displayName {
                            Text(email)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(CodexVisual.quietText)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 6) {
                    if let note = visibleStatusNote(for: account) {
                        Text(note)
                        Text("•")
                            .foregroundStyle(Color.primary.opacity(0.24))
                    }
                    Text(resetDate(from: account.usage.weekly.resetAt))
                        .monospacedDigit()
                }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(CodexVisual.quietText)
                    .lineLimit(1)
                    .padding(.leading, account.isActive ? 18 : 17)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            AccountUsageStack(
                fiveHour: account.fiveHourRemaining,
                weekly: account.weeklyRemaining
            )
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: CodexVisual.radiusMD, style: .continuous)
                .fill(account.isActive ? tint.opacity(0.08) : (isHovered ? Color.primary.opacity(0.04) : Color.clear))
                .overlay(
                    RoundedRectangle(cornerRadius: CodexVisual.radiusMD, style: .continuous)
                        .strokeBorder(account.isActive ? tint.opacity(0.24) : (isHovered ? Color.primary.opacity(0.08) : Color.clear))
                )
        )
        .contentShape(Rectangle())
        .onHover { hovering in
            isHovered = hovering
        }
        .animation(.easeOut(duration: 0.15), value: isHovered)
    }
}

struct ManagerSidebarAccountRow: View {
    let account: BridgeAccountSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 9) {
                StatusDot(color: account.isActive ? CodexVisual.neutralAccent : Color.primary.opacity(0.16), size: 8)
                Text(account.displayName)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                    .truncationMode(.tail)
            }

            HStack(spacing: 6) {
                PercentPill(label: "5H", value: account.fiveHourRemaining)
                PercentPill(label: "WK", value: account.weeklyRemaining)
            }
        }
        .padding(.vertical, 7)
    }
}

struct DetailHeaderView: View {
    let account: BridgeAccountSummary

    var body: some View {
        let note = visibleStatusNote(for: account)

        HStack(alignment: .center, spacing: 14) {
            ZStack {
                Circle()
                    .fill(statusColor(for: account).opacity(0.13))
                    .frame(width: 46, height: 46)
                AppGlyph(size: 24)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(account.displayName)
                    .font(.system(size: 24, weight: .semibold))
                    .lineLimit(1)
                    .truncationMode(.tail)

                HStack(spacing: 8) {
                    StatusDot(color: account.isActive ? CodexVisual.neutralAccent : Color.primary.opacity(0.18), size: 7)
                    if account.isActive {
                        Text("Active profile")
                    } else if let note {
                        Text(note)
                    }
                    if let email = account.email {
                        if account.isActive || note != nil {
                            Text("•")
                                .foregroundStyle(Color.primary.opacity(0.24))
                        }
                        Text(email)
                            .truncationMode(.middle)
                    }
                }
                .font(.callout.weight(.medium))
                .foregroundStyle(CodexVisual.quietText)
                .lineLimit(1)

                HStack(spacing: 6) {
                    Image(systemName: "folder")
                        .font(.system(size: 10))
                    Text(account.profileDir)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .textSelection(.enabled)
                }
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(CodexVisual.quietText)
                .padding(.top, 2)
            }

            Spacer()
        }
        .padding(.bottom, 4)
    }
}

struct DetailSection<Content: View>: View {
    let title: String
    var showSeparator = true
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if showSeparator {
                Divider()
                    .opacity(0.35)
                    .padding(.bottom, 4)
            }

            Text(title)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(CodexVisual.quietText)
                .textCase(.uppercase)

            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8)
    }
}

struct SheetActionButton: View {
    let title: String
    var systemImage: String?
    var isPrimary = false
    var isDisabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 13, weight: .semibold))
                }
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundStyle(isPrimary ? Color.white : Color.primary.opacity(0.86))
            .frame(minWidth: isPrimary ? 112 : 92)
            .frame(height: 34)
            .background(
                RoundedRectangle(cornerRadius: CodexVisual.radiusSM, style: .continuous)
                    .fill(isPrimary ? Color.accentColor.opacity(isDisabled ? 0.42 : 0.86) : Color.primary.opacity(0.065))
                    .overlay(
                        RoundedRectangle(cornerRadius: CodexVisual.radiusSM, style: .continuous)
                            .strokeBorder(isPrimary ? Color.white.opacity(0.18) : Color.primary.opacity(0.08))
                    )
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.58 : 1)
    }
}

struct AddAccountSheet: View {
    @EnvironmentObject private var model: KeyFlowAppModel
    @State private var label = ""
    @State private var deviceAuth = false

    private var trimmedLabel: String {
        label.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .top, spacing: 12) {
                AppGlyph(size: 30)
                    .padding(.top, 1)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Add account")
                        .font(.title3.weight(.semibold))
                    Text("Create a named Codex login profile.")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(CodexVisual.quietText)
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Profile label")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(CodexVisual.quietText)

                TextField("Personal, work, client...", text: $label)
                    .textFieldStyle(.plain)
                    .font(.system(size: 14, weight: .medium))
                    .padding(.horizontal, 12)
                    .frame(height: 36)
                    .background(
                        RoundedRectangle(cornerRadius: CodexVisual.radiusSM, style: .continuous)
                            .fill(Color.primary.opacity(0.045))
                            .overlay(
                                RoundedRectangle(cornerRadius: CodexVisual.radiusSM, style: .continuous)
                                    .strokeBorder(Color.primary.opacity(0.11))
                            )
                    )
            }

            Button {
                deviceAuth.toggle()
            } label: {
                HStack(alignment: .center, spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: CodexVisual.radiusSM, style: .continuous)
                            .fill(CodexVisual.neutralAccent.opacity(0.10))
                            .frame(width: 34, height: 34)
                        Image(systemName: deviceAuth ? "number.square.fill" : "safari.fill")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(CodexVisual.neutralAccent)
                    }

                    VStack(alignment: .leading, spacing: 3) {
                        Text("Use device auth")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.primary)
                        Text("Browser login is preferred. Use device auth if handoff fails.")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(CodexVisual.quietText)
                            .lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Toggle("", isOn: $deviceAuth)
                        .labelsHidden()
                        .toggleStyle(.switch)
                        .allowsHitTesting(false)
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: CodexVisual.radiusMD, style: .continuous)
                        .fill(Color.primary.opacity(0.045))
                        .overlay(
                            RoundedRectangle(cornerRadius: CodexVisual.radiusMD, style: .continuous)
                                .strokeBorder(Color.primary.opacity(0.09))
                        )
                )
            }
            .buttonStyle(.plain)

            HStack {
                Spacer()
                SheetActionButton(title: "Cancel") {
                    model.cancelCurrentOperation()
                    model.isAddAccountSheetPresented = false
                }
                SheetActionButton(
                    title: model.hasBlockingOperation ? "Adding" : "Add",
                    systemImage: model.hasBlockingOperation ? nil : "plus",
                    isPrimary: true,
                    isDisabled: model.hasBlockingOperation || trimmedLabel.isEmpty
                ) {
                    Task {
                        await model.addAccount(label: label, deviceAuth: deviceAuth)
                    }
                }
                .keyboardShortcut(.defaultAction)
            }
            .padding(.top, 2)
        }
        .padding(24)
        .frame(width: 430)
    }
}

struct MenuContentView: View {
    @EnvironmentObject private var model: KeyFlowAppModel
    let openManagerWindow: () -> Void
    var onAppear: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 13) {
                MenuHeaderView()

                if let banner = model.banner, banner.kind != .success {
                    BannerView(banner: banner)
                }

                ActionStripView(openManagerWindow: openManagerWindow)

                SectionDivider()

                if model.accounts.isEmpty {
                    EmptyStateView(title: "No accounts", detail: "Use Add to connect a Codex login.")
                        .padding(.vertical, 4)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(Array(model.accounts.enumerated()), id: \.element.id) { index, account in
                                Button {
                                    if account.usage.status == .reloginRequired {
                                        Task { await model.reloginAccount(id: account.id) }
                                    } else {
                                        guard account.canSwitch else { return }
                                        Task { await model.switchAccount(id: account.id) }
                                    }
                                } label: {
                                    AccountRowView(account: account)
                                }
                                .buttonStyle(.plain)
                                .disabled(model.hasBlockingOperation || (!account.canSwitch && account.usage.status != .reloginRequired))

                                if index < model.accounts.count - 1 {
                                    SectionDivider()
                                        .padding(.horizontal, 4)
                                }
                            }
                        }
                        .padding(.bottom, 2)
                    }
                    .frame(maxHeight: 240)
                }
            }
            .padding(16)

            Spacer(minLength: 0)
        }
        .frame(width: 384)
        .background(
            CodexVisual.surface
                .overlay(
                    LinearGradient(
                        colors: [
                            CodexVisual.neutralAccent.opacity(0.055),
                            Color.clear,
                        ],
                        startPoint: .topLeading,
                        endPoint: .center
                    )
                )
        )
        .onAppear {
            model.menuOpened()
            onAppear?()
        }
    }
}

struct ManagerWindowView: View {
    @EnvironmentObject private var model: KeyFlowAppModel
    @State private var showingRemoveConfirmation = false

    private var openAtLoginBinding: Binding<Bool> {
        Binding {
            model.openAtLogin
        } set: { enabled in
            model.setOpenAtLogin(enabled)
        }
    }

    var body: some View {
        NavigationSplitView {
            List(selection: $model.selectedAccountID) {
                ForEach(model.accounts) { account in
                    ManagerSidebarAccountRow(account: account)
                        .tag(Optional(account.id))
                }
            }
            .navigationTitle("Accounts")
            .navigationSplitViewColumnWidth(min: 300, ideal: 330, max: 360)
        } detail: {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    if let banner = model.banner {
                        BannerView(banner: banner)
                            .padding(.bottom, 2)
                    }

                    if let account = model.selectedAccount {
                        VStack(alignment: .leading, spacing: 18) {
                            DetailHeaderView(account: account)

                            LazyVGrid(
                                columns: [
                                    GridItem(.flexible(), spacing: 12),
                                    GridItem(.flexible(), spacing: 12),
                                ],
                                spacing: 12
                            ) {
                                ManagerMetricCard(
                                    title: "5H Remaining",
                                    tint: statusColor(for: account),
                                    valueContent: {
                                        Text(percentString(account.fiveHourRemaining))
                                    },
                                    noteContent: {
                                        Text("Resets at \(resetTime(from: account.usage.last5Hours.resetAt))")
                                    }
                                )
                                ManagerMetricCard(
                                    title: "Weekly Quota",
                                    tint: CodexVisual.neutralAccent,
                                    valueContent: {
                                        Text(percentString(account.weeklyRemaining))
                                    },
                                    noteContent: {
                                        Text("Resets \(resetDate(from: account.usage.weekly.resetAt))")
                                    }
                                )
                                ManagerMetricCard(
                                    title: "Last Sync",
                                    tint: CodexVisual.neutralAccent,
                                    valueContent: {
                                        RelativeTimestampText(prefix: "", milliseconds: account.usage.updatedAt)
                                    },
                                    noteContent: {
                                        Text("Sync active")
                                    }
                                )
                                ManagerMetricCard(
                                    title: "Plan Type",
                                    tint: CodexVisual.neutralAccent,
                                    valueContent: {
                                        Text((account.usage.planType ?? "unknown").uppercased())
                                    },
                                    noteContent: {
                                        Text("ChatGPT account")
                                    }
                                )
                            }

                            // SECTION 1: Account Actions & Preferences
                            DetailSection(title: "Account Actions & Preferences", showSeparator: true) {
                                // Status Notes or Errors if any
                                if let error = account.usage.error, !error.isEmpty {
                                    Text(error)
                                        .font(.caption)
                                        .foregroundStyle(CodexVisual.criticalAccent)
                                        .textSelection(.enabled)
                                        .padding(.bottom, 4)
                                } else if account.usage.status != .ok, let note = visibleStatusNote(for: account) {
                                    Text(note)
                                        .font(.caption)
                                        .foregroundStyle(CodexVisual.quietText)
                                        .padding(.bottom, 4)
                                }

                                // Quick Actions HStack
                                HStack(spacing: 10) {
                                    if account.usage.status == .reloginRequired {
                                        Button {
                                            Task { await model.reloginAccount(id: account.id) }
                                        } label: {
                                            Label("Re-login", systemImage: "person.crop.circle.badge.exclamationmark")
                                        }
                                        .disabled(model.hasBlockingOperation)
                                    }

                                    Button {
                                        Task { await model.switchAccount(id: account.id) }
                                    } label: {
                                        Label(account.isActive ? "Active" : "Switch", systemImage: account.isActive ? "checkmark.circle.fill" : "arrow.triangle.2.circlepath")
                                    }
                                    .disabled(model.hasBlockingOperation || !account.canSwitch || account.isActive)



                                    Button(role: .destructive) {
                                        showingRemoveConfirmation = true
                                    } label: {
                                        Label("Remove", systemImage: "trash")
                                    }
                                    .disabled(model.hasBlockingOperation)
                                }

                                Toggle("Auto-prime session (every 5h)", isOn: Binding(
                                    get: { UserDefaults.standard.object(forKey: "autoPrime_\(account.id)") as? Bool ?? true },
                                    set: { UserDefaults.standard.set($0, forKey: "autoPrime_\(account.id)") }
                                ))
                                .toggleStyle(.switch)
                                .font(.system(size: 12, weight: .medium))
                                .frame(width: 280, alignment: .leading)
                                .padding(.top, 4)
                            }
                            .confirmationDialog(
                                "Remove Account",
                                isPresented: $showingRemoveConfirmation,
                                titleVisibility: .visible
                            ) {
                                Button("Delete & Remove", role: .destructive) {
                                    Task { await model.removeSelectedAccount(purge: true) }
                                }
                                Button("Remove Only") {
                                    Task { await model.removeSelectedAccount(purge: false) }
                                }
                                Button("Cancel", role: .cancel) {}
                            } message: {
                                Text("Delete cached profile data for “\(account.displayName)” as well?")
                            }
                        }
                    } else {
                        EmptyStateView(
                            title: "No account selected",
                            detail: "Choose an account to inspect usage, switch, or remove it."
                        )
                        .padding(.top, 80)
                    }

                    // SECTION 2: System Settings & Diagnostics (Always displayed)
                    DetailSection(title: "System & Diagnostics", showSeparator: true) {
                        VStack(alignment: .leading, spacing: 14) {
                            // Part A: Open at Login Global Toggle
                            HStack(alignment: .center, spacing: 12) {
                                Image(systemName: "power.circle")
                                    .font(.system(size: 16))
                                    .foregroundStyle(CodexVisual.neutralAccent)
                                VStack(alignment: .leading, spacing: 4) {
                                    Toggle("Open at login", isOn: openAtLoginBinding)
                                        .toggleStyle(.switch)
                                        .font(.system(size: 12, weight: .medium))
                                    Text("Start KeyFlow automatically when you sign in.")
                                        .font(.caption)
                                        .foregroundStyle(CodexVisual.quietText)
                                }
                            }



                            // Part C: Codex environment status (Doctor Report)
                            VStack(alignment: .leading, spacing: 12) {
                                HStack {
                                    Text("Codex environment")
                                        .font(.subheadline.weight(.semibold))
                                    Spacer()
                                    Button {
                                        Task { await model.loadDoctor() }
                                    } label: {
                                        Label("Refresh Diagnostics", systemImage: "arrow.clockwise")
                                    }
                                    .buttonStyle(.borderless)
                                    .disabled(model.hasBlockingOperation)
                                }

                                if let doctor = model.doctorReport {
                                    LazyVGrid(
                                        columns: [
                                            GridItem(.flexible(), spacing: 20),
                                            GridItem(.flexible(), spacing: 20),
                                        ],
                                        alignment: .leading,
                                        spacing: 12
                                    ) {
                                        ForEach(doctor.checks) { check in
                                            VStack(alignment: .leading, spacing: 4) {
                                                HStack(spacing: 8) {
                                                    StatusDot(color: check.ok ? CodexVisual.neutralAccent : CodexVisual.criticalAccent, size: 7)
                                                    Text(check.name)
                                                        .font(.subheadline.weight(.semibold))
                                                }
                                                Text(check.details)
                                                    .font(.caption)
                                                    .foregroundStyle(CodexVisual.quietText)
                                                    .textSelection(.enabled)
                                                    .lineLimit(1)
                                            }
                                        }
                                    }
                                } else {
                                    Text("Diagnostics have not been loaded yet.")
                                        .font(.caption)
                                        .foregroundStyle(CodexVisual.quietText)
                                }
                            }
                        }
                    }
                }
                .padding(24)
            }
        }
        .frame(minWidth: 920, minHeight: 560)
        .toolbar {
            ToolbarItemGroup {
                Button {
                    Task { await model.refreshAll() }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }

                Button {
                    model.openAddAccountFlow()
                } label: {
                    Label("Add", systemImage: "plus")
                }
            }
        }
        .sheet(isPresented: $model.isAddAccountSheetPresented) {
            AddAccountSheet()
                .environmentObject(model)
        }
        .onAppear {
            model.managerOpened()
        }
    }
}
