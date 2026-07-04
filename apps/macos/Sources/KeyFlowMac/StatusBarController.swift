import AppKit
import SwiftUI

@MainActor
final class StatusBarController: NSObject, NSPopoverDelegate {
    private static let itemWidth: CGFloat = 34

    private let statusItem: NSStatusItem
    private let popover: NSPopover
    private let model: KeyFlowAppModel
    private let openManager: @MainActor () -> Void
    private let hostingView: NSHostingView<AnyView>
    private let statusMenu: NSMenu
    private var openAtLoginMenuItem: NSMenuItem?
    private var localEventMonitor: Any?
    private var globalEventMonitor: Any?

    init(model: KeyFlowAppModel, openManager: @escaping @MainActor () -> Void) {
        self.model = model
        self.openManager = openManager
        self.statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        self.popover = NSPopover()
        self.statusMenu = NSMenu()
        self.hostingView = NSHostingView(
            rootView: AnyView(StatusBarLabelView().environmentObject(model))
        )
        super.init()
        configureMenu()
        configureStatusItem()
        configurePopover()
        configureEventMonitoring()
    }

    @objc
    func togglePopover(_ sender: Any?) {
        guard let button = statusItem.button else { return }

        if popover.isShown {
            popover.performClose(sender)
            return
        }

        updatePopoverContentSize()

        let anchorRect = NSRect(
            x: button.bounds.midX - 1,
            y: 0,
            width: 2,
            height: button.bounds.height
        )

        popover.show(relativeTo: anchorRect, of: button, preferredEdge: .minY)
    }

    @objc
    func handleStatusItemClick(_ sender: NSStatusBarButton) {
        guard let event = NSApp.currentEvent else {
            togglePopover(sender)
            return
        }

        if event.type == .rightMouseUp || event.modifierFlags.contains(.control) {
            if popover.isShown {
                popover.performClose(sender)
            }

            statusItem.menu = statusMenu
            sender.performClick(nil)
            statusItem.menu = nil
            return
        }

        togglePopover(sender)
    }

    @objc
    func openManagerWindow(_ sender: Any?) {
        openManager()
    }

    @objc
    func refreshAllAccounts(_ sender: Any?) {
        Task {
            await model.refreshAll()
        }
    }

    @objc
    func addAccount(_ sender: Any?) {
        model.openAddAccountFlow()
        openManagerWindow(sender)
    }

    @objc
    func toggleOpenAtLogin(_ sender: Any?) {
        model.setOpenAtLogin(!model.openAtLogin)
        updateOpenAtLoginMenuItem()
    }

    @objc
    func quitApp(_ sender: Any?) {
        NSApplication.shared.terminate(sender)
    }

    private func configureStatusItem() {
        guard let button = statusItem.button else { return }

        statusItem.length = 26
        button.title = ""
        button.image = nil
        button.target = self
        button.action = #selector(handleStatusItemClick(_:))
        button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        button.setAccessibilityLabel("KeyFlow")

        hostingView.translatesAutoresizingMaskIntoConstraints = false
        button.addSubview(hostingView)

        NSLayoutConstraint.activate([
            hostingView.leadingAnchor.constraint(equalTo: button.leadingAnchor),
            hostingView.trailingAnchor.constraint(equalTo: button.trailingAnchor),
            hostingView.topAnchor.constraint(equalTo: button.topAnchor),
            hostingView.bottomAnchor.constraint(equalTo: button.bottomAnchor),
            hostingView.heightAnchor.constraint(equalToConstant: 22),
        ])
    }

    private func configureMenu() {
        statusMenu.delegate = self

        let openManager = NSMenuItem(title: "Open Manager", action: #selector(openManagerWindow(_:)), keyEquivalent: "")
        openManager.target = self
        statusMenu.addItem(openManager)

        let refresh = NSMenuItem(title: "Refresh All", action: #selector(refreshAllAccounts(_:)), keyEquivalent: "")
        refresh.target = self
        statusMenu.addItem(refresh)

        let add = NSMenuItem(title: "Add Account", action: #selector(addAccount(_:)), keyEquivalent: "")
        add.target = self
        statusMenu.addItem(add)

        statusMenu.addItem(.separator())

        let openAtLogin = NSMenuItem(title: "Open at Login", action: #selector(toggleOpenAtLogin(_:)), keyEquivalent: "")
        openAtLogin.target = self
        openAtLoginMenuItem = openAtLogin
        statusMenu.addItem(openAtLogin)

        statusMenu.addItem(.separator())

        let quit = NSMenuItem(title: "Quit", action: #selector(quitApp(_:)), keyEquivalent: "")
        quit.target = self
        statusMenu.addItem(quit)
    }

    private func updateOpenAtLoginMenuItem() {
        model.refreshOpenAtLoginStatus()
        openAtLoginMenuItem?.state = model.openAtLogin ? .on : .off
    }

    private func configurePopover() {
        popover.delegate = self
        popover.behavior = .applicationDefined
        popover.animates = true
        updatePopoverContentSize()
        popover.contentViewController = NSHostingController(
            rootView: MenuContentView(
                openManagerWindow: { [weak self] in
                    self?.openManagerWindow(nil)
                },
                onAppear: {}
            )
            .environmentObject(model)
        )
    }

    private func updatePopoverContentSize() {
        let showsBanner: Bool
        if let banner = model.banner {
            switch banner.kind {
            case .success:
                showsBanner = false
            case .info, .warning, .error:
                showsBanner = true
            }
        } else {
            showsBanner = false
        }

        popover.contentSize = NSSize(
            width: 384,
            height: menuPopoverHeight(accountCount: model.accounts.count, showsBanner: showsBanner)
        )
    }

    private func configureEventMonitoring() {
        localEventMonitor = NSEvent.addLocalMonitorForEvents(
            matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown, .keyDown]
        ) { [weak self] event in
            guard let self else { return event }
            return self.handleLocalEvent(event)
        }

        globalEventMonitor = NSEvent.addGlobalMonitorForEvents(
            matching: [.leftMouseDown, .rightMouseDown, .otherMouseDown]
        ) { [weak self] _ in
            guard let self, self.popover.isShown else { return }
            Task { @MainActor in
                self.popover.performClose(nil)
            }
        }

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationDidResignActive),
            name: NSApplication.didResignActiveNotification,
            object: nil
        )
    }

    private func handleLocalEvent(_ event: NSEvent) -> NSEvent? {
        guard popover.isShown else { return event }

        if event.type == .keyDown, event.keyCode == 53 {
            popover.performClose(nil)
            return nil
        }

        guard event.type != .keyDown else { return event }

        let targetWindow = event.window
        let popoverWindow = popover.contentViewController?.view.window
        let statusItemWindow = statusItem.button?.window

        if targetWindow == popoverWindow || targetWindow == statusItemWindow {
            return event
        }

        popover.performClose(nil)
        return event
    }

    @objc
    private func applicationDidResignActive() {
        guard popover.isShown else { return }
        popover.performClose(nil)
    }

    func popoverWillShow(_ notification: Notification) {
        updatePopoverContentSize()
    }

    func popoverDidShow(_ notification: Notification) {}

    func popoverWillClose(_ notification: Notification) {}
}

extension StatusBarController: NSMenuDelegate {
    func menuWillOpen(_ menu: NSMenu) {
        updateOpenAtLoginMenuItem()
    }
}
