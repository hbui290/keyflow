import AppKit
import CoreVideo
import QuartzCore
import os

struct MenuPerformanceConfiguration {
    let isEnabled: Bool
    let mainThreadPingIntervalTicks: Int
    let hitchThresholdMS: Double

    static func fromEnvironment(_ environment: [String: String] = ProcessInfo.processInfo.environment) -> Self {
        let rawValue = environment["CSW_ENABLE_MENU_PERF_MONITOR"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let isEnabled = rawValue == "1" || rawValue == "true" || rawValue == "yes"

        return Self(
            isEnabled: isEnabled,
            mainThreadPingIntervalTicks: 8,
            hitchThresholdMS: 33
        )
    }
}

final class MenuPerformanceMonitor: @unchecked Sendable {
    private let logger = Logger(subsystem: "com.winston.csw", category: "performance")
    private let stateQueue = DispatchQueue(label: "CSWMac.MenuPerformanceMonitor")
    private let configuration: MenuPerformanceConfiguration

    private var displayLink: CVDisplayLink?
    private var isMonitoring = false
    private var pendingMainThreadPing = false

    private var openRequestedAt: CFTimeInterval?
    private var willShowAt: CFTimeInterval?
    private var sessionStartedAt: CFTimeInterval = 0

    private var displayTicks = 0
    private var mainThreadFrames = 0
    private var skippedPings = 0
    private var hitchCount = 0
    private var worstHitchMS = 0.0
    private var displayTickSequence = 0

    init(configuration: MenuPerformanceConfiguration = .fromEnvironment()) {
        self.configuration = configuration
    }

    deinit {
        stopDisplayLink()
    }

    @MainActor
    func markOpenRequested() {
        guard configuration.isEnabled else { return }
        let now = CACurrentMediaTime()
        stateQueue.async {
            self.openRequestedAt = now
            self.willShowAt = nil
        }
        logger.notice("menu open requested")
    }

    @MainActor
    func menuWillShow() {
        guard configuration.isEnabled else { return }
        let now = CACurrentMediaTime()
        stateQueue.async {
            self.willShowAt = now
            self.startSession(now: now)
        }
        logger.notice("menu will show")
    }

    @MainActor
    func menuDidShow() {
        guard configuration.isEnabled else { return }
        let now = CACurrentMediaTime()
        stateQueue.async {
            let requestLatencyMS = self.openRequestedAt.map { (now - $0) * 1000 }
            let willShowLatencyMS = self.willShowAt.map { (now - $0) * 1000 }
            let message = String(
                format: "menu did show request_latency_ms=%.1f show_latency_ms=%.1f",
                requestLatencyMS ?? -1,
                willShowLatencyMS ?? -1
            )
            self.logger.notice("\(message, privacy: .public)")
        }
    }

    @MainActor
    func menuContentDidAppear() {
        guard configuration.isEnabled else { return }
        let now = CACurrentMediaTime()
        stateQueue.async {
            let renderLatencyMS = self.openRequestedAt.map { (now - $0) * 1000 }
            let message = String(
                format: "menu content appeared request_to_content_ms=%.1f",
                renderLatencyMS ?? -1
            )
            self.logger.notice("\(message, privacy: .public)")
        }
    }

    @MainActor
    func menuWillClose() {
        guard configuration.isEnabled else { return }
        stateQueue.async {
            guard self.isMonitoring else { return }

            let now = CACurrentMediaTime()
            let elapsed = max(now - self.sessionStartedAt, 0.001)
            let uiFPS = Double(self.mainThreadFrames) / elapsed
            let displayFPS = Double(self.displayTicks) / elapsed
            let message = String(
                format: "menu perf summary duration_s=%.2f ui_fps=%.1f display_fps=%.1f hitches=%d skipped_pings=%d worst_hitch_ms=%.1f",
                elapsed,
                uiFPS,
                displayFPS,
                self.hitchCount,
                self.skippedPings,
                self.worstHitchMS
            )
            self.logger.notice("\(message, privacy: .public)")

            self.resetSessionState()
            self.stopDisplayLinkLocked()
        }
    }

    private func startSession(now: CFTimeInterval) {
        resetCounters(now: now)
        guard !isMonitoring else { return }
        isMonitoring = true
        startDisplayLink()
    }

    private func resetCounters(now: CFTimeInterval) {
        sessionStartedAt = now
        displayTicks = 0
        mainThreadFrames = 0
        skippedPings = 0
        hitchCount = 0
        worstHitchMS = 0
        pendingMainThreadPing = false
        displayTickSequence = 0
    }

    private func resetSessionState() {
        isMonitoring = false
        openRequestedAt = nil
        willShowAt = nil
        resetCounters(now: 0)
    }

    private func startDisplayLink() {
        guard displayLink == nil else {
            CVDisplayLinkStart(displayLink!)
            return
        }

        var createdLink: CVDisplayLink?
        let status = CVDisplayLinkCreateWithActiveCGDisplays(&createdLink)
        guard status == kCVReturnSuccess, let createdLink else {
            logger.error("failed to create CVDisplayLink status=\(status)")
            return
        }

        let callbackStatus = CVDisplayLinkSetOutputCallback(
            createdLink,
            { _, _, _, _, _, context in
                guard let context else { return kCVReturnError }
                let monitor = Unmanaged<MenuPerformanceMonitor>.fromOpaque(context).takeUnretainedValue()
                monitor.handleDisplayTick()
                return kCVReturnSuccess
            },
            Unmanaged.passUnretained(self).toOpaque()
        )

        guard callbackStatus == kCVReturnSuccess else {
            logger.error("failed to register CVDisplayLink callback status=\(callbackStatus)")
            return
        }

        displayLink = createdLink
        CVDisplayLinkStart(createdLink)
    }

    private func stopDisplayLink() {
        stateQueue.sync {
            self.stopDisplayLinkLocked()
        }
    }

    private func stopDisplayLinkLocked() {
        guard let displayLink else { return }
        CVDisplayLinkStop(displayLink)
        self.displayLink = nil
    }

    private func handleDisplayTick() {
        guard configuration.isEnabled else { return }
        let tickTime = CACurrentMediaTime()

        stateQueue.async {
            guard self.isMonitoring else { return }

            self.displayTicks += 1
            self.displayTickSequence += 1

            if self.displayTickSequence % self.configuration.mainThreadPingIntervalTicks != 0 {
                return
            }

            if self.pendingMainThreadPing {
                self.skippedPings += 1
            } else {
                self.pendingMainThreadPing = true
                let scheduledAt = tickTime
                Task { @MainActor in
                    self.recordMainThreadFrame(scheduledAt: scheduledAt)
                }
            }
        }
    }

    @MainActor
    private func recordMainThreadFrame(scheduledAt: CFTimeInterval) {
        let delayMS = (CACurrentMediaTime() - scheduledAt) * 1000

        stateQueue.async {
            guard self.isMonitoring else { return }

            self.pendingMainThreadPing = false
            self.mainThreadFrames += 1

            if delayMS >= self.configuration.hitchThresholdMS {
                self.hitchCount += 1
                self.worstHitchMS = max(self.worstHitchMS, delayMS)
                let message = String(format: "menu main-thread hitch delay_ms=%.1f", delayMS)
                self.logger.warning("\(message, privacy: .public)")
            }
        }
    }
}
