import Foundation

enum BridgeClientError: LocalizedError {
    case bundledBridgeNotBuilt(URL)
    case repoNotFound
    case cliNotBuilt(URL)
    case bunNotFound
    case transport(String)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .bundledBridgeNotBuilt(let url):
            return "Missing bundled bridge at \(url.path). Rebuild the app bundle."
        case .repoNotFound:
            return "Unable to locate the keyflow repository root. Set KEYFLOW_REPO_ROOT before launching the macOS app."
        case .cliNotBuilt(let url):
            return "Missing built bridge at \(url.path). Run `bun run compile` first."
        case .bunNotFound:
            return "Unable to locate Bun. Install Bun 1.2+ or launch the app with PATH including the Bun binary."
        case .transport(let message), .decoding(let message):
            return message
        }
    }
}

final class KeyFlowBridgeClient: @unchecked Sendable {
    private struct BridgeCommand {
        let workingDirectory: URL
        let executableURL: URL
        let argumentsPrefix: [String]
    }

    private let decoder = JSONDecoder()
    private let initialCommand: BridgeCommand
    private let environment: [String: String]

    init() throws {
        let environment = Self.buildBridgeEnvironment()
        self.environment = environment

        if let bundledBridge = Self.resolveBundledBridge() {
            self.initialCommand = bundledBridge
            return
        }

        let bunURL = try Self.resolveBunExecutable(environment: environment)
        let repoCommand = try Self.resolveRepoBridge(bunURL: bunURL)
        self.initialCommand = repoCommand
    }

    func fetchStatus() async throws -> BridgeStatusPayload {
        try await run(["status"], as: BridgeStatusPayload.self)
    }

    func linkCurrent() async throws -> BridgeLinkCurrentPayload {
        try await run(["link-current"], as: BridgeLinkCurrentPayload.self)
    }

    func refreshActive() async throws -> BridgeActionPayload {
        try await run(["refresh", "--active"], as: BridgeActionPayload.self)
    }

    func refreshAll() async throws -> BridgeActionPayload {
        try await run(["refresh", "--all"], as: BridgeActionPayload.self)
    }

    func switchAccount(id: String) async throws -> BridgeUsePayload {
        try await run(["use", "--account", id], as: BridgeUsePayload.self)
    }

    func addAccount(label: String, deviceAuth: Bool) async throws -> BridgeActionPayload {
        var arguments = ["add", "--label", label]
        if deviceAuth {
            arguments.append("--device-auth")
        }
        return try await run(arguments, as: BridgeActionPayload.self)
    }

    func reloginAccount(id: String, deviceAuth: Bool) async throws -> BridgeActionPayload {
        var arguments = ["relogin", "--account", id]
        if deviceAuth {
            arguments.append("--device-auth")
        }
        return try await run(arguments, as: BridgeActionPayload.self)
    }

    func removeAccount(id: String, purge: Bool) async throws -> BridgeActionPayload {
        var arguments = ["remove", "--account", id]
        if purge {
            arguments.append("--purge")
        }
        return try await run(arguments, as: BridgeActionPayload.self)
    }

    func doctor() async throws -> BridgeDoctorPayload {
        try await run(["doctor"], as: BridgeDoctorPayload.self)
    }

    func primeAccount(id: String?) async throws -> BridgeActionPayload {
        var arguments = ["prime"]
        if let id = id {
            arguments.append(contentsOf: ["--account", id])
        }
        return try await run(arguments, as: BridgeActionPayload.self)
    }

    private final class DataAccumulator: @unchecked Sendable {
        private var data = Data()
        private let lock = NSLock()
        
        func append(_ newData: Data) {
            lock.lock()
            data.append(newData)
            lock.unlock()
        }
        
        func retrieve() -> Data {
            lock.lock()
            defer { lock.unlock() }
            return data
        }
    }

    private func run<Payload: Decodable & Sendable>(_ arguments: [String], as type: Payload.Type) async throws -> Payload {
        let command = initialCommand
        return try await withCheckedThrowingContinuation { continuation in
            let process = Process()
            let stdout = Pipe()
            let stderr = Pipe()

            process.executableURL = command.executableURL
            process.arguments = command.argumentsPrefix + arguments
            if let workingDirectory = Self.validatedWorkingDirectory(command.workingDirectory) {
                process.currentDirectoryURL = workingDirectory
            }
            process.environment = environment
            process.standardOutput = stdout
            process.standardError = stderr

            let stdoutAccumulator = DataAccumulator()
            let stderrAccumulator = DataAccumulator()
            let stdoutHandle = stdout.fileHandleForReading
            let stderrHandle = stderr.fileHandleForReading

            stdoutHandle.readabilityHandler = { handle in
                let data = handle.availableData
                guard !data.isEmpty else { return }
                stdoutAccumulator.append(data)
            }

            stderrHandle.readabilityHandler = { handle in
                let data = handle.availableData
                guard !data.isEmpty else { return }
                stderrAccumulator.append(data)
            }

            process.terminationHandler = { [decoder] process in
                stdoutHandle.readabilityHandler = nil
                stderrHandle.readabilityHandler = nil

                let remainingStdout = stdoutHandle.readDataToEndOfFile()
                if !remainingStdout.isEmpty {
                    stdoutAccumulator.append(remainingStdout)
                }
                let remainingStderr = stderrHandle.readDataToEndOfFile()
                if !remainingStderr.isEmpty {
                    stderrAccumulator.append(remainingStderr)
                }

                let stdoutData = stdoutAccumulator.retrieve()
                let stderrData = stderrAccumulator.retrieve()

                do {
                    if !stdoutData.isEmpty {
                        let envelope = try decoder.decode(BridgeEnvelope<Payload>.self, from: stdoutData)
                        if envelope.ok, let payload = envelope.data {
                            continuation.resume(returning: payload)
                            return
                        }

                        if let bridgeError = envelope.error {
                            throw BridgeClientError.transport(bridgeError.message)
                        }
                    }

                    let stderrText = String(data: stderrData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    if !stderrText.isEmpty {
                        throw BridgeClientError.transport(stderrText)
                    }

                    throw BridgeClientError.transport("Bridge command failed with exit code \(process.terminationStatus).")
                } catch let error as BridgeClientError {
                    continuation.resume(throwing: error)
                } catch {
                    let raw = String(data: stdoutData, encoding: .utf8) ?? "<empty>"
                    continuation.resume(throwing: BridgeClientError.decoding("Failed to decode bridge response: \(raw)"))
                }
            }

            do {
                try process.run()
            } catch {
                stdoutHandle.readabilityHandler = nil
                stderrHandle.readabilityHandler = nil
                continuation.resume(throwing: BridgeClientError.transport("Failed to launch bridge: \(error.localizedDescription)"))
            }
        }
    }

    private static func resolveBundledBridge() -> BridgeCommand? {
        guard
            let resourcesURL = Bundle.main.resourceURL,
            let bridgeDirectory = bundledBridgeDirectory(resourcesURL: resourcesURL)
        else {
            return nil
        }

        let cliURL = bridgeDirectory.appendingPathComponent("kfl-bridge")
        return BridgeCommand(
            workingDirectory: bridgeDirectory,
            executableURL: cliURL,
            argumentsPrefix: []
        )
    }

    static func bundledBridgeDirectory(resourcesURL: URL, fileManager: FileManager = .default) -> URL? {
        for root in bundledBridgeSearchRoots(from: resourcesURL) {
            let bridgeDirectory = root.appendingPathComponent("bridge", isDirectory: true)
            let cliURL = bridgeDirectory.appendingPathComponent("kfl-bridge")
            if fileManager.fileExists(atPath: cliURL.path) {
                return bridgeDirectory
            }
        }

        return nil
    }

    static func bundledBridgeSearchRoots(from resourcesURL: URL) -> [URL] {
        let standardizedResourcesURL = resourcesURL.standardizedFileURL
        let parentResourcesURL = standardizedResourcesURL
            .deletingLastPathComponent()
            .appendingPathComponent("Resources", isDirectory: true)

        return [standardizedResourcesURL,
                standardizedResourcesURL.appendingPathComponent("Resources", isDirectory: true),
                parentResourcesURL]
    }

    static func validatedWorkingDirectory(_ directory: URL, fileManager: FileManager = .default) -> URL? {
        let path = directory.path
        guard fileManager.fileExists(atPath: path) else {
            return nil
        }

        return directory
    }

    private static func resolveRepoBridge(bunURL: URL) throws -> BridgeCommand {
        let repoRoot = try resolveRepoRoot()
        let cliURL = repoRoot.appendingPathComponent("dist/kfl-bridge")
        guard FileManager.default.fileExists(atPath: cliURL.path) else {
            throw BridgeClientError.cliNotBuilt(cliURL)
        }

        return BridgeCommand(
            workingDirectory: repoRoot,
            executableURL: cliURL,
            argumentsPrefix: []
        )
    }

    private static func buildBridgeEnvironment() -> [String: String] {
        var environment = ProcessInfo.processInfo.environment
        environment["HOME"] = environment["HOME"] ?? NSHomeDirectory()

        let inheritedPath = environment["PATH"] ?? ""
        let loginShellPath = resolveLoginShellPath()
        let commonPaths = [
            "\(NSHomeDirectory())/.bun/bin",
            "\(NSHomeDirectory())/.local/bin",
            "/Applications/Codex.app/Contents/Resources",
            "/opt/homebrew/bin",
            "/opt/homebrew/sbin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
        ].joined(separator: ":")

        environment["PATH"] = mergePathEntries([loginShellPath, inheritedPath, commonPaths])
        return environment
    }

    nonisolated(unsafe) private static var cachedLoginShellPath: String = ""
    nonisolated(unsafe) private static var isResolvingShellPath = false

    private static func resolveLoginShellPath() -> String {
        if !cachedLoginShellPath.isEmpty {
            return cachedLoginShellPath
        }
        if isResolvingShellPath {
            return ""
        }
        isResolvingShellPath = true

        DispatchQueue.global(qos: .background).async {
            let environment = ProcessInfo.processInfo.environment
            let shellPath = environment["SHELL"].flatMap { $0.isEmpty ? nil : $0 } ?? "/bin/zsh"
            guard FileManager.default.isExecutableFile(atPath: shellPath) else {
                isResolvingShellPath = false
                return
            }

            let process = Process()
            let stdout = Pipe()
            process.executableURL = URL(fileURLWithPath: shellPath)
            process.arguments = ["-lc", "printf '%s' \"$PATH\""]
            process.standardOutput = stdout
            process.standardError = Pipe()

            do {
                try process.run()
                process.waitUntilExit()
                if process.terminationStatus == 0 {
                    let data = stdout.fileHandleForReading.readDataToEndOfFile()
                    if let pathString = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) {
                        cachedLoginShellPath = pathString
                    }
                }
            } catch {}
            isResolvingShellPath = false
        }

        return ""
    }

    private static func mergePathEntries(_ pathValues: [String]) -> String {
        var seen = Set<String>()
        var entries: [String] = []

        for pathValue in pathValues where !pathValue.isEmpty {
            for entry in pathValue.split(separator: ":").map(String.init) where !entry.isEmpty {
                if seen.insert(entry).inserted {
                    entries.append(entry)
                }
            }
        }

        return entries.joined(separator: ":")
    }

    private static func resolveBunExecutable(environment: [String: String]) throws -> URL {
        let fileManager = FileManager.default
        let pathValue = environment["PATH"] ?? ""

        for directory in pathValue.split(separator: ":").map(String.init) where !directory.isEmpty {
            let bunURL = URL(fileURLWithPath: directory).appendingPathComponent("bun")
            if fileManager.isExecutableFile(atPath: bunURL.path) {
                return bunURL
            }
        }

        throw BridgeClientError.bunNotFound
    }

    private static func resolveRepoRoot() throws -> URL {
        let fileManager = FileManager.default
        let env = ProcessInfo.processInfo.environment

        if let explicit = env["KEYFLOW_REPO_ROOT"] ?? env["KFL_REPO_ROOT"] ?? env["CSW_REPO_ROOT"] ?? env["CODEX_SWITCH_REPO_ROOT"], !explicit.isEmpty {
            let url = URL(fileURLWithPath: explicit)
            if isRepoRoot(url) {
                return url
            }
        }

        let cwd = URL(fileURLWithPath: fileManager.currentDirectoryPath)
        if let resolved = walkAncestors(from: cwd) {
            return resolved
        }

        if let executableURL = Bundle.main.executableURL, let resolved = walkAncestors(from: executableURL.deletingLastPathComponent()) {
            return resolved
        }

        if let firstArgument = CommandLine.arguments.first, !firstArgument.isEmpty {
            let commandURL = URL(fileURLWithPath: firstArgument)
            if let resolved = walkAncestors(from: commandURL.deletingLastPathComponent()) {
                return resolved
            }
        }

        throw BridgeClientError.repoNotFound
    }

    private static func walkAncestors(from start: URL) -> URL? {
        var current = start.standardizedFileURL

        while true {
            if isRepoRoot(current) {
                return current
            }

            let parent = current.deletingLastPathComponent()
            if parent.path == current.path {
                return nil
            }
            current = parent
        }
    }

    private static func isRepoRoot(_ url: URL) -> Bool {
        let packageJSON = url.appendingPathComponent("package.json").path
        let distBridgeCLI = url.appendingPathComponent("dist/kfl-bridge").path
        return FileManager.default.fileExists(atPath: packageJSON) && FileManager.default.fileExists(atPath: distBridgeCLI)
    }
}
