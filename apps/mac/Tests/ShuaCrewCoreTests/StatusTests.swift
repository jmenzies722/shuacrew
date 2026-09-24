import Foundation
import ShuaCrewCore
import Testing

@Test func decodesTheGatewaysStatus() throws {
    let json = #"{"running":2,"awaiting":1,"reviewing":0,"approvals":[{"id":"a1","run":"r_1","runTitle":"Ship it","tool":"Bash","summary":"git push origin main","risk":"high","reason":"pushes to a remote"}],"limited":["codex"]}"#
    let status = try JSONDecoder().decode(CrewStatus.self, from: Data(json.utf8))
    #expect(status.approvals.first?.summary == "git push origin main")
    #expect(status.headline == "2 running · 1 awaiting you")
    #expect(status.badge == "1") // what's blocked outranks what's busy
}

@Test func quietWhenNothingIsHappening() {
    #expect(CrewStatus.empty.headline == "All quiet")
    #expect(CrewStatus.empty.badge == nil)
}

@Test func notifiesEachApprovalOnce() {
    let a = CrewStatus.Approval(id: "a", run: nil, runTitle: "", tool: "Bash", summary: "", risk: "low", reason: "")
    let b = CrewStatus.Approval(id: "b", run: nil, runTitle: "", tool: "Edit", summary: "", risk: "low", reason: "")
    let status = CrewStatus(running: 0, awaiting: 2, reviewing: 0, approvals: [a, b], limited: [])
    #expect(status.newApprovals(since: ["a"]).map(\.id) == ["b"])
}
