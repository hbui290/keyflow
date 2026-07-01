import Combine
import Foundation
import ServiceManagement

enum BannerKind: Equatable {
    case info
    case success
    case warning
    case error
}

struct BannerState {
    let kind: BannerKind
    let message: String
}

struct AppOperation {
    let title: String
    let subtitle: String?
}

@MainActor
final class KeyFlowAppModel: ObservableObject {
    @Published private(set) var status: BridgeStatusPayload?
    @Published private(set) var doctorReport: BridgeDoctorPayload?
    @Published private(set) var currentOperation: AppOperation?
    @Published private(set) var isRefreshingAll = false
    @Published private(set) var banner: BannerState?
    @Published var selectedAccountID: String?
    @Published var isAddAccountSheetPresented = false
    @Published var purgeProfileOnRemove = false
    @Published private(set) var openAtLogin = false

    let bridge: KeyFlowBridgeClient?
    private var refreshTimer: AnyCancellable?

    init() {
        do {
            bridge = try KeyFlowBridgeClient()
        } catch {
            bridge = nil
            banner = BannerState(kind: .error, message: error.localizedDescription)
        }

        startTimers()

        Task {
            await bootstrap()
        }
    }

    var accounts: [BridgeAccountSummary] {
        status?.accounts ?? []
    }

    var activeAccount: BridgeAccountSummary? {
        status?.activeAccount
    }

    var selectedAccount: BridgeAccountSummary? {
        guard let selectedAccountID else { return activeAccount }
        return accounts.first(where: { $0.id == selectedAccountID }) ?? activeAccount
    }

    var hasBlockingOperation: Bool {
        currentOperation != nil
    }

    func bootstrap() async {
        await loadCachedStatus(showSuccessBanner: false)
        await linkCurrent(showBanner: false)
        await refreshActive(showSuccessBanner: false, reason: "Refreshing active account…")
    }

    func menuOpened() {
        selectValidAccount()
    }

    func managerOpened() {
        selectValidAccount()
        guard doctorReport == nil, !hasBlockingOperation else { return }
        Task {
            await loadDoctor(showBanner: false)
        }
    }

    func openAddAccountFlow() {
        isAddAccountSheetPresented = true
    }

    func refreshOpenAtLoginStatus() {
        openAtLogin = SMAppService.mainApp.status == .enabled
    }

    func setOpenAtLogin(_ enabled: Bool) {
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
            refreshOpenAtLoginStatus()
            banner = BannerState(kind: .success, message: enabled ? "Codex Switch will open at login." : "Codex Switch will no longer open at login.")
        } catch {
            refreshOpenAtLoginStatus()
            banner = BannerState(kind: .error, message: error.localizedDescription)
        }
    }

    func loadCachedStatus(showSuccessBanner: Bool = false) async {
        guard let bridge else { return }
        do {
            let status = try await bridge.fetchStatus()
            applyStatus(status)
            if showSuccessBanner {
                banner = BannerState(kind: .success, message: "Status updated.")
            } else {
                clearNonSuccessBanner()
            }
        } catch {
            banner = BannerState(kind: .error, message: error.localizedDescription)
        }
    }

    func linkCurrent(showBanner: Bool) async {
        guard let bridge else { return }
        guard currentOperation == nil else { return }

        currentOperation = AppOperation(title: "Syncing current account", subtitle: nil)
        defer { currentOperation = nil }

        do {
            let result = try await bridge.linkCurrent()
            applyStatus(result.state)

            if showBanner {
                let kind: BannerKind = result.linked ? (result.warning == nil ? .success : .warning) : .info
                banner = BannerState(kind: kind, message: result.warning ?? result.message)
            } else if result.warning != nil {
                banner = BannerState(kind: .warning, message: result.warning ?? result.message)
            } else {
                clearNonSuccessBanner()
            }
        } catch {
            if showBanner {
                banner = BannerState(kind: .error, message: error.localizedDescription)
            }
        }
    }

    func refreshActive(showSuccessBanner: Bool = true, reason: String = "Refreshing active account…") async {
        guard let bridge else { return }
        guard currentOperation == nil else { return }

        do {
            let result = try await bridge.refreshActive()
            applyStatus(result.state)
            if let warning = result.warning {
                banner = BannerState(kind: .warning, message: warning)
            } else if showSuccessBanner {
                banner = BannerState(kind: .success, message: result.message)
            } else {
                clearNonSuccessBanner()
            }
        } catch {
            banner = BannerState(kind: .error, message: error.localizedDescription)
        }
    }

    func refreshAll() async {
        guard let bridge else { return }
        guard currentOperation == nil else { return }
        guard !isRefreshingAll else { return }

        isRefreshingAll = true
        defer { isRefreshingAll = false }

        do {
            let result = try await bridge.refreshAll()
            applyStatus(result.state)
            if let warning = result.warning {
                banner = BannerState(kind: .warning, message: warning)
            } else {
                clearNonSuccessBanner()
            }
        } catch {
            banner = BannerState(kind: .error, message: error.localizedDescription)
        }
    }

    func switchAccount(id: String) async {
        guard let bridge else { return }
        guard currentOperation == nil else { return }

        currentOperation = AppOperation(title: "Switching account", subtitle: accounts.first(where: { $0.id == id })?.displayName)
        defer { currentOperation = nil }

        do {
            let result = try await bridge.switchAccount(id: id)
            applyStatus(result.state)
            if let warning = result.warning {
                banner = BannerState(kind: .warning, message: warning)
            } else {
                banner = BannerState(kind: .success, message: result.message)
            }
        } catch {
            banner = BannerState(kind: .error, message: error.localizedDescription)
        }
    }

    func addAccount(label: String, deviceAuth: Bool) async {
        guard let bridge else { return }
        guard currentOperation == nil else { return }

        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            banner = BannerState(kind: .warning, message: "Account label is required.")
            return
        }

        currentOperation = AppOperation(
            title: deviceAuth ? "Waiting for device auth" : "Waiting for browser login",
            subtitle: trimmed
        )
        defer { currentOperation = nil }

        do {
            let result = try await bridge.addAccount(label: trimmed, deviceAuth: deviceAuth)
            applyStatus(result.state)
            isAddAccountSheetPresented = false
            if let newAccountID = result.affectedAccountId {
                selectedAccountID = newAccountID
            }
            if let warning = result.warning {
                banner = BannerState(kind: .warning, message: warning)
            } else {
                banner = BannerState(kind: .success, message: result.message)
            }
        } catch {
            banner = BannerState(kind: .error, message: error.localizedDescription)
        }
    }

    func reloginAccount(id: String, deviceAuth: Bool = false) async {
        guard let bridge else { return }
        guard currentOperation == nil else { return }

        let accountName = accounts.first(where: { $0.id == id })?.displayName
        currentOperation = AppOperation(
            title: deviceAuth ? "Waiting for device auth" : "Waiting for browser login",
            subtitle: accountName
        )
        defer { currentOperation = nil }

        do {
            let result = try await bridge.reloginAccount(id: id, deviceAuth: deviceAuth)
            applyStatus(result.state)
            if let accountID = result.affectedAccountId {
                selectedAccountID = accountID
            }
            if let warning = result.warning {
                banner = BannerState(kind: .warning, message: warning)
            } else {
                banner = BannerState(kind: .success, message: result.message)
            }
        } catch {
            banner = BannerState(kind: .error, message: error.localizedDescription)
        }
    }

    func removeSelectedAccount() async {
        guard let bridge else { return }
        guard currentOperation == nil else { return }
        guard let selectedAccount else {
            banner = BannerState(kind: .warning, message: "No account selected.")
            return
        }

        currentOperation = AppOperation(title: "Removing account", subtitle: selectedAccount.displayName)
        defer { currentOperation = nil }

        do {
            let result = try await bridge.removeAccount(id: selectedAccount.id, purge: purgeProfileOnRemove)
            applyStatus(result.state)
            purgeProfileOnRemove = false
            banner = BannerState(kind: .success, message: result.message)
        } catch {
            banner = BannerState(kind: .error, message: error.localizedDescription)
        }
    }

    func loadDoctor(showBanner: Bool = true) async {
        guard let bridge else { return }

        do {
            let report = try await bridge.doctor()
            doctorReport = report
            if showBanner {
                banner = BannerState(
                    kind: report.hasFailures ? .warning : .success,
                    message: report.hasFailures ? "Diagnostics found issues." : "Diagnostics look healthy."
                )
            } else if report.hasFailures {
                banner = BannerState(kind: .warning, message: "Diagnostics found issues.")
            } else {
                clearNonSuccessBanner()
            }
        } catch {
            if showBanner {
                banner = BannerState(kind: .error, message: error.localizedDescription)
            }
        }
    }

    private func applyStatus(_ status: BridgeStatusPayload) {
        self.status = status
        selectValidAccount()
    }

    private func selectValidAccount() {
        if let selectedAccountID, accounts.contains(where: { $0.id == selectedAccountID }) {
            return
        }

        selectedAccountID = status?.activeAccountId ?? accounts.first?.id
    }

    private func clearNonSuccessBanner() {
        guard let banner, banner.kind != .success else { return }
        self.banner = nil
    }

    private func startTimers() {
        refreshTimer = Timer.publish(every: 120, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self else { return }
                Task {
                    await self.refreshActive(showSuccessBanner: false, reason: "Refreshing active account…")
                }
            }
    }
}
