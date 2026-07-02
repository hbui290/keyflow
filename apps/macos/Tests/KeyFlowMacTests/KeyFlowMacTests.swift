import Foundation
import AppKit
import XCTest
@testable import KeyFlowMac

final class KeyFlowMacTests: XCTestCase {

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

    func testTimeRemainingFormatsHoursAndMinutes() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let target = now.addingTimeInterval((2 * 60 * 60) + (15 * 60))

        XCTAssertEqual(timeRemaining(until: target.timeIntervalSince1970, now: now), "2h 15m")
    }

    func testTimeRemainingFormatsExpiredAsNow() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)

        XCTAssertEqual(timeRemaining(until: now.addingTimeInterval(-30).timeIntervalSince1970, now: now), "now")
    }

    func testMenuPerformanceMonitorIsDisabledByDefault() {
        let configuration = MenuPerformanceConfiguration.fromEnvironment([:])

        XCTAssertFalse(configuration.isEnabled)
        XCTAssertEqual(configuration.mainThreadPingIntervalTicks, 8)
    }

    func testMenuPerformanceMonitorCanBeEnabledFromEnvironment() {
        let configuration = MenuPerformanceConfiguration.fromEnvironment([
            "CODEX_SWITCH_ENABLE_MENU_PERF_MONITOR": "true",
        ])

        XCTAssertTrue(configuration.isEnabled)
    }

    func testAppLaunchPolicyKeepsDockHiddenForStatusBarOnlyApp() {
        XCTAssertEqual(appLaunchActivationPolicy(), .accessory)
    }

    func testAppConfiguresEditMenuForTextFieldShortcuts() throws {
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/KeyFlowMac/KeyFlowMacApp.swift")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)

        XCTAssertTrue(source.contains("configureMainMenu()"))
        XCTAssertTrue(source.contains("#selector(NSText.paste(_:))"))
        XCTAssertTrue(source.contains("keyEquivalent: \"v\""))
    }

    func testAppBundleIsConfiguredAsStatusBarOnlyAgent() throws {
        let plistURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Info.plist")
        let plistData = try Data(contentsOf: plistURL)
        guard let plist = try PropertyListSerialization.propertyList(from: plistData, format: nil) as? [String: Any] else {
            XCTFail("Failed to serialize plist")
            return
        }

        XCTAssertEqual(plist["LSUIElement"] as? Bool, true)
    }

    func testAppLaunchDoesNotAutomaticallyOpenManagerWindow() throws {
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/KeyFlowMac/KeyFlowMacApp.swift")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)

        XCTAssertFalse(source.contains("DispatchQueue.main.async"))
    }

    func testStatusBarNumberStringOmitsPercentSymbol() {
        XCTAssertEqual(statusBarNumberString(61.4), "61")
        XCTAssertEqual(statusBarNumberString(99.6), "100")
        XCTAssertEqual(statusBarNumberString(nil as Double?), "n/a")
    }

    func testAppModelInitDoesNotSynchronouslyRefreshOpenAtLoginStatus() throws {
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
            XCTFail("Could not locate KeyFlowAppModel.init() in source")
            return
        }

        let initializerBody = source[initStart.upperBound..<initEnd.lowerBound]

        XCTAssertFalse(initializerBody.contains("refreshOpenAtLoginStatus()"))
    }

    func testAppModelManagerOpenedDoesNotSynchronouslyRefreshOpenAtLoginStatus() throws {
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
            XCTFail("Could not locate KeyFlowAppModel.managerOpened() in source")
            return
        }

        let methodBody = source[methodStart.upperBound..<methodEnd.lowerBound]

        XCTAssertFalse(methodBody.contains("refreshOpenAtLoginStatus()"))
    }

    func testMenuPopoverHeightFitsAccountCountAndCapsAtMaximum() {
        let oneAccountHeight = menuPopoverHeight(accountCount: 1, showsBanner: false)
        let threeAccountHeight = menuPopoverHeight(accountCount: 3, showsBanner: false)
        let manyAccountHeight = menuPopoverHeight(accountCount: 10, showsBanner: true)

        XCTAssertTrue(oneAccountHeight < threeAccountHeight)
        XCTAssertTrue(oneAccountHeight <= 360)
        XCTAssertEqual(manyAccountHeight, 560)
    }

    func testVisibleStatusNoteHidesReadyForOkAccounts() {
        XCTAssertNil(visibleStatusNote(for: makeAccount(status: .ok)))
        XCTAssertEqual(visibleStatusNote(for: makeAccount(status: .stale)), "Stale")
    }

    func testBundledBridgeDirectoryFindsBridgeInResourcesRoot() throws {
        try withTemporaryDirectory { directory in
            let bridgeDirectory = directory.appendingPathComponent("bridge", isDirectory: true)
            try FileManager.default.createDirectory(at: bridgeDirectory, withIntermediateDirectories: true)
            FileManager.default.createFile(atPath: bridgeDirectory.appendingPathComponent("bridge-cli.js").path, contents: Data())

            let resolved = CodexBridgeClient.bundledBridgeDirectory(resourcesURL: directory)

            XCTAssertEqual(resolved, bridgeDirectory)
        }
    }

    func testBundledBridgeDirectoryFindsBridgeInNestedResourcesDirectory() throws {
        try withTemporaryDirectory { directory in
            let nestedResources = directory.appendingPathComponent("Resources", isDirectory: true)
            let bridgeDirectory = nestedResources.appendingPathComponent("bridge", isDirectory: true)
            try FileManager.default.createDirectory(at: bridgeDirectory, withIntermediateDirectories: true)
            FileManager.default.createFile(atPath: bridgeDirectory.appendingPathComponent("bridge-cli.js").path, contents: Data())

            let resolved = CodexBridgeClient.bundledBridgeDirectory(resourcesURL: directory)

            XCTAssertEqual(resolved, bridgeDirectory)
        }
    }

    func testValidatedWorkingDirectoryRejectsMissingDirectory() {
        let missingDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)

        XCTAssertNil(CodexBridgeClient.validatedWorkingDirectory(missingDirectory))
    }
}
