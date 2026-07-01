import AppKit
import SwiftUI

func appLaunchActivationPolicy() -> NSApplication.ActivationPolicy {
    .accessory
}

@MainActor
@main
final class AppDelegate: NSObject, NSApplicationDelegate {
    private static var sharedDelegate: AppDelegate?

    let model = KeyFlowAppModel()
    private var managerWindow: NSWindow?
    private var statusBarController: StatusBarController?

    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        sharedDelegate = delegate
        app.delegate = delegate
        app.run()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureMainMenu()
        NSApplication.shared.setActivationPolicy(appLaunchActivationPolicy())
        if let icon = makeRuntimeAppIcon() {
            NSApplication.shared.applicationIconImage = icon
        }
        statusBarController = StatusBarController(model: model) { [weak self] in
            self?.showManagerWindow()
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showManagerWindow()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    private func showManagerWindow() {
        if managerWindow == nil {
            let hostingController = NSHostingController(
                rootView: ManagerWindowView()
                    .environmentObject(model)
            )
            let window = NSWindow(contentViewController: hostingController)
            window.title = "CSW Manager"
            window.styleMask = [.titled, .closable, .miniaturizable, .resizable]
            window.setContentSize(NSSize(width: 920, height: 580))
            window.isReleasedWhenClosed = false
            window.center()
            managerWindow = window
        }

        NSApplication.shared.setActivationPolicy(appLaunchActivationPolicy())
        managerWindow?.makeKeyAndOrderFront(nil)
        managerWindow?.orderFrontRegardless()
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    private func configureMainMenu() {
        let mainMenu = NSMenu()
        let appMenuItem = NSMenuItem()
        let editMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        mainMenu.addItem(editMenuItem)

        let appMenu = NSMenu()
        appMenu.addItem(
            NSMenuItem(
                title: "Quit CSW",
                action: #selector(NSApplication.terminate(_:)),
                keyEquivalent: "q"
            )
        )
        appMenuItem.submenu = appMenu

        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(NSMenuItem(title: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(NSMenuItem(title: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        editMenu.addItem(NSMenuItem(title: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        editMenu.addItem(NSMenuItem(title: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        editMenuItem.submenu = editMenu

        NSApplication.shared.mainMenu = mainMenu
    }
}
