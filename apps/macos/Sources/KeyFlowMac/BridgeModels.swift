import Foundation

struct BridgeEnvelope<Payload: Decodable & Sendable>: Decodable, Sendable {
    let ok: Bool
    let data: Payload?
    let error: BridgeErrorPayload?
}

struct BridgeErrorPayload: Decodable, Sendable {
    let message: String
    let code: String
}

enum BridgeUsageHealth: String, Codable, Sendable {
    case never
    case ok
    case stale
    case error
    case reloginRequired = "relogin_required"
}

struct UsageWindow: Codable, Hashable, Sendable {
    let usedPercent: Double?
    let remainingPercent: Double?
    let resetAt: Double?
    let windowSeconds: Double?
}

struct UsageSnapshot: Codable, Hashable, Sendable {
    let source: String
    let planType: String?
    let status: BridgeUsageHealth
    let error: String?
    let updatedAt: Double?
    let last5Hours: UsageWindow
    let weekly: UsageWindow
}

struct BridgeAccountSummary: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let label: String
    let email: String?
    let displayName: String
    let profileDir: String
    let authSignature: String?
    let createdAt: Double
    let updatedAt: Double
    let usage: UsageSnapshot
    let isActive: Bool
    let canSwitch: Bool
    let isBlocked: Bool
    let needsAttention: Bool
}

struct BridgeStatusPayload: Codable, Sendable {
    let generatedAt: Double
    let activeAccountId: String?
    let totalAccounts: Int
    let activeAccount: BridgeAccountSummary?
    let accounts: [BridgeAccountSummary]
}

struct BridgeActionPayload: Codable, Sendable {
    let generatedAt: Double
    let message: String
    let warning: String?
    let affectedAccountId: String?
    let updatedAccountIds: [String]
    let state: BridgeStatusPayload
}

struct BridgeSwitchResult: Codable, Sendable {
    let backupPath: String?
    let codexStatusExitCode: Int
    let codexStatusStdout: String
    let codexStatusStderr: String
}

struct BridgeUsePayload: Codable, Sendable {
    let generatedAt: Double
    let message: String
    let warning: String?
    let affectedAccountId: String?
    let updatedAccountIds: [String]
    let state: BridgeStatusPayload
    let switchResult: BridgeSwitchResult
}

struct BridgeLinkCurrentPayload: Codable, Sendable {
    let generatedAt: Double
    let message: String
    let warning: String?
    let affectedAccountId: String?
    let updatedAccountIds: [String]
    let state: BridgeStatusPayload
    let linked: Bool
    let created: Bool
}

struct DoctorCheck: Codable, Hashable, Identifiable, Sendable {
    let name: String
    let ok: Bool
    let details: String

    var id: String { name }
}

struct BridgeDoctorPayload: Codable, Sendable {
    let generatedAt: Double
    let checks: [DoctorCheck]
    let hasFailures: Bool
}

extension BridgeAccountSummary {
    var subtitle: String {
        email ?? label
    }

    var fiveHourRemaining: Double? {
        usage.last5Hours.remainingPercent
    }

    var weeklyRemaining: Double? {
        usage.weekly.remainingPercent
    }
}

extension Double {
    var percentText: String {
        "\(Int(self.rounded()))%"
    }
}

func dateFromMillis(_ value: Double?) -> Date? {
    guard let value else { return nil }
    return Date(timeIntervalSince1970: value / 1000)
}

func dateFromSeconds(_ value: Double?) -> Date? {
    guard let value else { return nil }
    return Date(timeIntervalSince1970: value)
}
