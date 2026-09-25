// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ShuaCrew",
    platforms: [.macOS(.v15)],
    dependencies: [.package(path: "../../packages/apple")],
    targets: [
        // What can be tested without a window: the status wire format and what the menu bar shows.
        .target(name: "ShuaCrewCore"),
        .executableTarget(name: "ShuaCrew", dependencies: ["ShuaCrewCore", .product(name: "ShuaCrewMobile", package: "apple")]),
        .testTarget(name: "ShuaCrewCoreTests", dependencies: ["ShuaCrewCore"]),
    ],
    swiftLanguageModes: [.v5]
)
