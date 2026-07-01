import Foundation
import AppKit
import Testing
@testable import KeyFlowMac

private func withTemporaryDirectory(_ body: (URL) throws -> Void) throws {
    let directory = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    try body(directory)
}

private func makeAccount(status: BridgeUsageHealth = .ok) -> BridgeAccountSummary {
    BridgeAccountSummary(
        id: UUID().uuidString,
        label: "test",
        email: "test@example.com",
        displayName: "test@example.com",
        profileDir: "/tmp/test",
        authSignature: nil,
        createdAt: 0,
        updatedAt: 0,
        usage: UsageSnapshot(
            source: "test",
            planType: nil,
            status: status,
            error: nil,
            updatedAt: nil,
            last5Hours: UsageWindow(usedPercent: nil, remainingPercent: 77, resetAt: nil, windowSeconds: nil),
            weekly: UsageWindow(usedPercent: nil, remainingPercent: 73, resetAt: nil, windowSeconds: nil)
        ),
        isActive: true,
        canSwitch: true,
        isBlocked: false,
        needsAttention: false
    )
}

@Test
func timeRemainingFormatsHoursAndMinutes() {
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    let target = now.addingTimeInterval((2 * 60 * 60) + (15 * 60))

    #expect(timeRemaining(until: target.timeIntervalSince1970, now: now) == "2h 15m")
}

@Test
func timeRemainingFormatsExpiredAsNow() {
    let now = Date(timeIntervalSince1970: 1_700_000_000)

    #expect(timeRemaining(until: now.addingTimeInterval(-30).timeIntervalSince1970, now: now) == "now")
}

@Test
func menuPerformanceMonitorIsDisabledByDefault() {
    let configuration = MenuPerformanceConfiguration.fromEnvironment([:])

    #expect(configuration.isEnabled == false)
    #expect(configuration.mainThreadPingIntervalTicks == 8)
}

@Test
func menuPerformanceMonitorCanBeEnabledFromEnvironment() {
    let configuration = MenuPerformanceConfiguration.fromEnvironment([
        "CODEX_SWITCH_ENABLE_MENU_PERF_MONITOR": "true",
    ])

    #expect(configuration.isEnabled == true)
}

@Test
func appLaunchPolicyKeepsDockHiddenForStatusBarOnlyApp() {
    #expect(appLaunchActivationPolicy() == .accessory)
}

@Test
func appConfiguresEditMenuForTextFieldShortcuts() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Sources/KeyFlowMac/KeyFlowMacApp.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)

    #expect(source.contains("configureMainMenu()"))
    #expect(source.contains("#selector(NSText.paste(_:))"))
    #expect(source.contains("keyEquivalent: \"v\""))
}

@Test
func appBundleIsConfiguredAsStatusBarOnlyAgent() throws {
    let plistURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Info.plist")
    let plistData = try Data(contentsOf: plistURL)
    let plist = try #require(PropertyListSerialization.propertyList(from: plistData, format: nil) as? [String: Any])

    #expect(plist["LSUIElement"] as? Bool == true)
}

@Test
func appLaunchDoesNotAutomaticallyOpenManagerWindow() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Sources/KeyFlowMac/KeyFlowMacApp.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)

    #expect(!source.contains("DispatchQueue.main.async"))
}

@Test
func statusBarLabelUsesBatteryStyleMeter() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Sources/KeyFlowMac/Views.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)
    let viewStart = try #require(source.range(of: "struct StatusBarLabelView: View"))
    let viewEnd = try #require(source[viewStart.upperBound...].range(of: "struct StatusBarBatteryMeter"))
    let viewSource = source[viewStart.lowerBound..<viewEnd.lowerBound]

    #expect(!viewSource.contains("Text(statusBarNumberString(remaining))"))
    #expect(viewSource.contains("StatusBarBatteryMeter(percent: remaining"))
    #expect(viewSource.contains("height: 10"))
    #expect(viewSource.contains(".frame(width: 30, height: 10)"))
    #expect(viewSource.contains(".frame(maxWidth: .infinity, alignment: .center)"))
    #expect(viewSource.contains(".frame(maxWidth: .infinity, minHeight: 14, alignment: .center)"))
    #expect(!viewSource.contains("CompactUsageBar(percent: remaining"))
    #expect(!viewSource.contains(".frame(width: 58"))
    #expect(!viewSource.contains(".padding("))
    #expect(!viewSource.contains("AppGlyph(size:"))
    #expect(!viewSource.contains("statusBarUsageTextColor"))
}

@Test
func statusBarItemUsesCompactWidth() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Sources/KeyFlowMac/StatusBarController.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)

    #expect(source.contains("private static let itemWidth: CGFloat = 34"))
}

@Test
func statusBarNumberStringOmitsPercentSymbol() {
    #expect(statusBarNumberString(61.4) == "61")
    #expect(statusBarNumberString(99.6) == "100")
    #expect(statusBarNumberString(nil as Double?) == "n/a")
}

@Test
func statusBarUsageBarUsesVisibleContrast() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Sources/KeyFlowMac/Views.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)

    #expect(source.contains(".fill(Color.black.opacity(0.58))"))
    #expect(source.contains(".strokeBorder(Color.white.opacity(0.38)"))
    #expect(source.contains("fill.opacity(0.92)"))
    #expect(source.contains("return Color.primary"))
}

@Test
func statusBarBatteryMeterDoesNotOverlayNumberText() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Sources/KeyFlowMac/Views.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)
    let meterStart = try #require(source.range(of: "struct StatusBarBatteryMeter: View"))
    let meterEnd = try #require(source[meterStart.upperBound...].range(of: "private func statusBarUsageColor"))
    let meterSource = source[meterStart.lowerBound..<meterEnd.lowerBound]

    #expect(meterSource.contains("GeometryReader"))
    #expect(meterSource.contains("percentFillWidth"))
    #expect(!meterSource.contains("Text(statusBarNumberString(percent))"))
    #expect(!meterSource.contains("Text(percentString(percent))"))
    #expect(!meterSource.contains(".mask(alignment: .leading)"))
    #expect(!meterSource.contains("statusBarUsageTextColor"))
}



@Test
func appModelInitDoesNotSynchronouslyRefreshOpenAtLoginStatus() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Sources/KeyFlowMac/KeyFlowAppModel.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)
    guard
        let initStart = source.range(of: "    init() {"),
        let initEnd = source[initStart.upperBound...].range(of: "    var accounts:")
    else {
        Issue.record("Could not locate KeyFlowAppModel.init() in source")
        return
    }

    let initializerBody = source[initStart.upperBound..<initEnd.lowerBound]

    #expect(!initializerBody.contains("refreshOpenAtLoginStatus()"))
}

@Test
func appModelManagerOpenedDoesNotSynchronouslyRefreshOpenAtLoginStatus() throws {
    let sourceURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Sources/KeyFlowMac/KeyFlowAppModel.swift")
    let source = try String(contentsOf: sourceURL, encoding: .utf8)
    guard
        let methodStart = source.range(of: "    func managerOpened() {"),
        let methodEnd = source[methodStart.upperBound...].range(of: "    func openAddAccountFlow()")
    else {
        Issue.record("Could not locate KeyFlowAppModel.managerOpened() in source")
        return
    }

    let methodBody = source[methodStart.upperBound..<methodEnd.lowerBound]

    #expect(!methodBody.contains("refreshOpenAtLoginStatus()"))
}

@Test
func menuPopoverHeightFitsAccountCountAndCapsAtMaximum() {
    let oneAccountHeight = menuPopoverHeight(accountCount: 1, showsBanner: false)
    let threeAccountHeight = menuPopoverHeight(accountCount: 3, showsBanner: false)
    let manyAccountHeight = menuPopoverHeight(accountCount: 10, showsBanner: true)

    #expect(oneAccountHeight < threeAccountHeight)
    #expect(oneAccountHeight <= 360)
    #expect(manyAccountHeight == 560)
}

@Test
func visibleStatusNoteHidesReadyForOkAccounts() {
    #expect(visibleStatusNote(for: makeAccount(status: .ok)) == nil)
    #expect(visibleStatusNote(for: makeAccount(status: .stale)) == "Stale")
}

@Test
func bundledBridgeDirectoryFindsBridgeInResourcesRoot() throws {
    try withTemporaryDirectory { directory in
        let bridgeDirectory = directory.appendingPathComponent("bridge", isDirectory: true)
        try FileManager.default.createDirectory(at: bridgeDirectory, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: bridgeDirectory.appendingPathComponent("bridge-cli.js").path, contents: Data())

        let resolved = CodexBridgeClient.bundledBridgeDirectory(resourcesURL: directory)

        #expect(resolved == bridgeDirectory)
    }
}

@Test
func bundledBridgeDirectoryFindsBridgeInNestedResourcesDirectory() throws {
    try withTemporaryDirectory { directory in
        let nestedResources = directory.appendingPathComponent("Resources", isDirectory: true)
        let bridgeDirectory = nestedResources.appendingPathComponent("bridge", isDirectory: true)
        try FileManager.default.createDirectory(at: bridgeDirectory, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: bridgeDirectory.appendingPathComponent("bridge-cli.js").path, contents: Data())

        let resolved = CodexBridgeClient.bundledBridgeDirectory(resourcesURL: directory)

        #expect(resolved == bridgeDirectory)
    }
}

@Test
func validatedWorkingDirectoryRejectsMissingDirectory() {
    let missingDirectory = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)

    #expect(CodexBridgeClient.validatedWorkingDirectory(missingDirectory) == nil)
}
