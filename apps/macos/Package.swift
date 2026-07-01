// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "KeyFlowMac",
    platforms: [
        .macOS(.v13),
    ],
    products: [
        .executable(name: "KeyFlowMac", targets: ["KeyFlowMac"]),
    ],
    targets: [
        .executableTarget(
            name: "KeyFlowMac",
            path: "Sources/KeyFlowMac",
            resources: [
                .copy("Resources"),
            ]
        ),
        .testTarget(
            name: "KeyFlowMacTests",
            dependencies: ["KeyFlowMac"],
            path: "Tests/KeyFlowMacTests"
        ),
    ]
)
