// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "ShuaCrewMobile", platforms: [.macOS(.v15), .iOS("27.0"), .watchOS("27.0")], products: [.library(name: "ShuaCrewMobile", targets: ["ShuaCrewMobile"])], targets: [.target(name: "ShuaCrewMobile"), .testTarget(name: "ShuaCrewMobileTests", dependencies: ["ShuaCrewMobile"])])
