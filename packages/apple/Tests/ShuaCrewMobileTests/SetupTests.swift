import Testing
@testable import ShuaCrewMobile

@Test func mobileSetupRequiresSignedConfiguredCloudKitBuild() {
    #expect(!MobileBuildReadiness(signed: false, adHoc: true, container: nil, entitledContainers: [], services: [], team: nil).canEnable)
    #expect(!MobileBuildReadiness(signed: true, adHoc: true, container: "iCloud.dev.shuacrew", entitledContainers: ["iCloud.dev.shuacrew"], services: ["CloudKit"], team: "TEAM").canEnable)
    #expect(!MobileBuildReadiness(signed: true, adHoc: false, container: "iCloud.dev.shuacrew", entitledContainers: ["iCloud.other"], services: ["CloudKit"], team: "TEAM").canEnable)
    #expect(MobileBuildReadiness(signed: true, adHoc: false, container: "iCloud.dev.shuacrew", entitledContainers: ["iCloud.dev.shuacrew"], services: ["CloudKit"], team: "TEAM").canEnable)
}

@Test func retryBackoffIsBoundedAndHonorsLongerServerDelay() {
    var retry = MobileSyncRetry()
    #expect((0..<8).map { _ in retry.failure() } == [1, 2, 4, 8, 16, 32, 60, 60])
    #expect(retry.failure(serverDelay: 120) == 120)
    retry.reset()
    #expect(retry.failure(serverDelay: .nan) == 1)
}
