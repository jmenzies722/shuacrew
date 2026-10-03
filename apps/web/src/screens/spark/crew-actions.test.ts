import { afterEach, expect, it, vi } from "vitest";
import { crewDetail } from "../../lib/crew-voice";
import { api, cancelRun, decideApproval } from "../../lib/api";
import { perform, performNow, sparkHooks } from "./actions";
vi.mock("../../lib/api", () => ({ api: vi.fn(async () => ({ url: "https://example.com/pr/1" })), cancelRun: vi.fn(async () => ({})), decideApproval: vi.fn(async () => ({})), launchRun: vi.fn() }));
vi.mock("./bridge", () => ({ native: () => undefined, post: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); sparkHooks.confirmDelete = null; });
const sessions = { target: { id: "target", title: "Dark mode", status: "reviewing" } };
function ref() { return crewDetail(sessions, {}).match(/(S\d+) “Dark mode”/)![1]!; }
it("routes a spoken message to the selected session", async () => {
  await performNow({ type: "crew_message", ref: ref(), text: "Add tests" });
  expect(api).toHaveBeenCalledWith("/api/runs/target/followup", { body: { text: "Add tests" } });
});
it("does not merge or push without confirmation", async () => {
  for (const type of ["crew_review", "crew_pr"] as const) {
    const result = await perform(type === "crew_review" ? { type, ref: ref(), approve: true } : { type, ref: ref() });
    expect(result.message).not.toContain("deleted");
  }
  expect(api).not.toHaveBeenCalled();
});
it("does not redirect a confirmation to another session after the crew changes", async () => {
  const original = ref();
  sparkHooks.confirmDelete = async () => { crewDetail({ other: { id: "other", title: "Another job", status: "reviewing" } }, {}); return true; };
  const result = await perform({ type: "crew_review", ref: original, approve: true });
  expect(result.ok).toBe(false);
  expect(api).not.toHaveBeenCalled();
});
it("rejects unknown refs and the wrong kind of ref before sending a request", async () => {
  const session = ref();
  expect((await performNow({ type: "crew_decide", ref: session, allow: true })).ok).toBe(false);
  expect((await performNow({ type: "crew_stop", ref: "missing" })).ok).toBe(false);
  expect(decideApproval).not.toHaveBeenCalled(); expect(cancelRun).not.toHaveBeenCalled();
});
it("archives only finished sessions and forwards review and PR results", async () => {
  expect((await performNow({ type: "crew_delete", ref: ref() })).ok).toBe(true);
  expect(api).toHaveBeenLastCalledWith("/api/runs/target/archive", { body: {} });
  sparkHooks.confirmDelete = async () => true;
  expect((await perform({ type: "crew_review", ref: ref(), approve: true })).message).toBe("Queued for merge");
  expect(api).toHaveBeenLastCalledWith("/api/runs/target/review", { body: { approve: true } });
  expect((await perform({ type: "crew_pr", ref: ref() })).message).toBe("PR opened: https://example.com/pr/1");
  crewDetail({ target: { ...sessions.target, status: "running" } }, {});
  vi.mocked(api).mockClear();
  expect((await performNow({ type: "crew_delete", ref: "target" })).ok).toBe(false);
  expect(api).not.toHaveBeenCalled();
});

it("does not reject or merge a session that is still running", async () => {
  const session = ref();
  crewDetail({ target: { ...sessions.target, status: "running" } }, {});
  for (const approve of [false, true]) expect((await performNow({ type: "crew_review", ref: session, approve })).ok).toBe(false);
  expect(api).not.toHaveBeenCalled();
});
it("names the selected session in its confirmation", async () => {
  const confirm = vi.fn(async (_label: string) => false); sparkHooks.confirmDelete = confirm;
  await perform({ type: "crew_pr", ref: ref() });
  expect(confirm.mock.calls[0]?.[0]).toContain("Dark mode");
});

it("does not execute when the user cancels during confirmation", async () => {
 let active=true;
 sparkHooks.confirmDelete=async()=>{active=false;return true;};
 const result=await perform({type:"crew_review",ref:ref(),approve:true},{active:()=>active});
 expect(result.ok).toBe(false);expect(api).not.toHaveBeenCalled();
});

it("reserves a streamed action only once while concurrent callers await its result", async () => {
 const target=ref();
 vi.mocked(api).mockImplementation(async (url) => url.endsWith("/claim") ? {claimed:true,conflict:false,result:null} : url.endsWith("/finish") ? {saved:true} : {});
 const action={type:"crew_message" as const,ref:target,text:"Add tests"};
 const results=await Promise.all([perform(action,{requestId:"same-request"}),perform(action,{requestId:"same-request"})]);
 expect(results.every(r=>r.ok)).toBe(true);
 expect(vi.mocked(api).mock.calls.filter(([url])=>url.endsWith("/followup"))).toHaveLength(1);
});
it("does not retry an action whose previous outcome is unknown", async () => {
 const target=ref();vi.mocked(api).mockResolvedValueOnce({claimed:false,conflict:false,result:null});
 expect((await perform({type:"crew_message",ref:target,text:"Hello"},{requestId:"unknown-request"})).ok).toBe(false);
 expect(vi.mocked(api).mock.calls).toHaveLength(1);
});
