import Foundation
import UserNotifications
import OSLog

@MainActor
final class NotificationManager {
    static let shared = NotificationManager()
    private let logger = Logger(subsystem: "com.winston.keyflow", category: "NotificationManager")

    private init() {}

    func requestAuthorization() {
        let logger = self.logger
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
            if let error = error {
                logger.error("Failed to request notification authorization: \(error.localizedDescription)")
            } else {
                logger.info("Notification authorization granted: \(granted)")
            }
        }
    }

    func sendNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil // Deliver immediately
        )

        let logger = self.logger
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                logger.error("Failed to deliver notification: \(error.localizedDescription)")
            }
        }
    }
}
