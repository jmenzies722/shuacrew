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

@Test func notifiesEachOutcomeOnceAndReadsOlderGateways() throws {
    let json = #"{"running":0,"awaiting":0,"reviewing":1,"approvals":[],"limited":[],"recent":[{"id":"r1","title":"Fix the retry","status":"reviewing","reason":"","files":2}]}"#
    let status = try JSONDecoder().decode(CrewStatus.self, from: Data(json.utf8))
    #expect(status.recent.first?.headline == "Ready for review")
    #expect(status.recent.first?.detail == "Fix the retry — 2 files changed")
    #expect(status.newlyFinished(since: ["r1:reviewing"]).isEmpty)
    #expect(status.newlyFinished(since: ["r1:running"]).count == 1)
    let old = #"{"running":0,"awaiting":0,"reviewing":0,"approvals":[],"limited":[]}"#
    #expect(try JSONDecoder().decode(CrewStatus.self, from: Data(old.utf8)).recent.isEmpty)
}

@Test func playbookGatesWaitOnYouAndNotifyOnce() throws {
    let json = #"{"running":1,"awaiting":0,"reviewing":0,"approvals":[],"limited":[],"reviews":[{"play":"p_1","index":1,"key":"p_1:1:1:review","title":"Validate an idea — Fern","phase":"Customer pains","status":"review","who":"🔎 Rhea","note":"","last":false}]}"#
    let status = try JSONDecoder().decode(CrewStatus.self, from: Data(json.utf8))
    #expect(status.headline == "1 running · 1 playbook review")
    #expect(status.badge == "1") // a gate waiting on you outranks what's busy
    #expect(status.reviews.first?.headline == "Customer pains is ready for your review")
    #expect(status.reviews.first?.detail == "🔎 Rhea · Validate an idea — Fern")
    #expect(status.newReviews(since: ["p_1:1:1:review"]).isEmpty)
    #expect(status.newReviews(since: []).count == 1)
}

@Test func carriesTodaysBriefing() throws {
    let json = #"{"running":0,"awaiting":0,"reviewing":0,"approvals":[],"limited":[],"briefing":{"id":"b_1","day":"2026-09-24","headline":"2 things need you · MRR $132"}}"#
    let status = try JSONDecoder().decode(CrewStatus.self, from: Data(json.utf8))
    #expect(status.briefing?.headline == "2 things need you · MRR $132")
    let none = #"{"running":0,"awaiting":0,"reviewing":0,"approvals":[],"limited":[],"briefing":null}"#
    #expect(try JSONDecoder().decode(CrewStatus.self, from: Data(none.utf8)).briefing == nil)
}

@Test func nowPlayingDecodesAndOlderGatewaysStayQuiet() throws {
    let json = #"{"running":1,"awaiting":0,"reviewing":0,"approvals":[],"limited":[],"now":{"id":"r1","title":"Ship it","who":"Eli","status":"running","updatedAt":1}}"#
    let status = try JSONDecoder().decode(CrewStatus.self, from: Data(json.utf8))
    #expect(status.now?.line == "Ship it — Eli")
    #expect(status.now?.live == true)
    #expect(status.now?.stoppable == true)
    let old = #"{"running":0,"awaiting":0,"reviewing":0,"approvals":[],"limited":[]}"#
    #expect(try JSONDecoder().decode(CrewStatus.self, from: Data(old.utf8)).now == nil)
}

@Test func menuBarModesPickTheBadge() throws {
    func status(_ json: String) throws -> CrewStatus { try JSONDecoder().decode(CrewStatus.self, from: Data(json.utf8)) }
    let base = #""running":2,"awaiting":0,"reviewing":0,"approvals":[],"limited":[],"tokensToday":386300"#
    #expect(try status("{\(base)}").badge == "2")                                   // older gateways: attention
    #expect(try status(#"{"menuBar":"tokens","# + base + "}").badge == "386k")
    #expect(try status(#"{"menuBar":"off","# + base + "}").badge == nil)
    #expect(try status(#"{"menuBar":"running","# + base + "}").badge == "2")
    #expect(CrewStatus.compact(1_300_000) == "1.3M")
}
