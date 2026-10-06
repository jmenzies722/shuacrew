import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fold } from "@shuacrew/core";
import { MockRuntime, type Runtime, type RunSpec } from "@shuacrew/runtimes";
import { afterEach, describe, expect, it } from "vitest";
import { Crew } from "./crew.js";
import { Memory } from "./memory.js";
import { Supervisor } from "./runs.js";
import { createServer } from "./server.js";
import { EventStore } from "./store.js";

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});
async function until(check: () => boolean, ms = 10000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 15));
  }
}

async function world(runtimeId = "mock") {
  process.env.SHUACREW_HOME = mkdtempSync(path.join(os.tmpdir(), "shua-home-"));
  const store = new EventStore(":memory:");
  const seen: RunSpec[] = [];
  const mock = new MockRuntime({ pace: 0 });
  const spy: Runtime = Object.assign(Object.create(mock), { start: (run: RunSpec, ctx: Parameters<Runtime["start"]>[1]) => (seen.push(run), mock.start(run, ctx)) });
  const memory = new Memory(store);
  const crew = new Crew(store);
  const supervisor = new Supervisor(store, new Map([[runtimeId, spy]]), { workspace: mkdtempSync(path.join(os.tmpdir(), "shua-ws-")), roots: [], memory, crew });
  spy.id = runtimeId;
  const { app } = await createServer({ store, supervisor, runtimes: new Map([["mock", spy]]), crew, memory });
  cleanups.push(async () => (await app.close(), crew.stop(), memory.stop(), supervisor.shutdown(), store.close()));
  return { store, crew, memory, supervisor, app, seen };
}
const status = (store: EventStore, run: string) => fold(store.read(0)).runs[run]?.status ?? "";
const post = (app: Awaited<ReturnType<typeof world>>["app"], url: string, body: object) =>
  app.inject({ method: "POST", url, headers: { "x-shuacrew": "1", "content-type": "application/json" }, payload: JSON.stringify(body) });

describe("the crew", () => {
  it("offers only opted-in Claude specialists and excludes the caller", async () => {
    const { crew, store, app } = await world();
    crew.starter();
    expect(crew.agentsFor("claude")).toBeUndefined();
    const designer = crew.get("designer")!;
    const response = await post(app, "/api/crew", { ...designer, delegatable: true });
    expect(response.statusCode).toBe(200);
    expect(fold(store.read(0)).members.designer?.delegatable).toBe(true);
    expect(crew.agentsFor("claude")?.["crew-designer"]).toMatchObject({ model: designer.model, disallowedTools: ["Agent", "Task"] });
    expect(crew.agentsFor("claude")?.["crew-designer"]?.prompt).toContain(designer.persona);
    expect(crew.agentsFor("claude", "designer")).toBeUndefined();
    expect(crew.agentsFor("codex")).toBeUndefined();
    crew.set({ ...designer, delegatable: true, runtime: "codex" });
    expect(crew.agentsFor("claude")).toBeUndefined();
  });

  it("passes enabled crew definitions to the runtime and updates them on the next run", async () => {
    const { crew, supervisor, store, seen } = await world("claude");
    crew.starter();
    const designer = crew.get("designer")!;
    crew.set({ ...designer, delegatable: true });
    const first = supervisor.launch({ ask: "Summarize the design", runtime: "claude" });
    await until(() => ["done", "reviewing"].includes(status(store, first)));
    expect(seen.find((r) => r.id === first)?.agents?.["crew-designer"]?.description).toContain("Dani");
    crew.set({ ...designer, delegatable: false });
    const second = supervisor.launch({ ask: "Summarize the next design", runtime: "claude" });
    await until(() => ["done", "reviewing"].includes(status(store, second)));
    expect(seen.find((r) => r.id === second)?.agents).toBeUndefined();
  });

  it("adds the starter team once, and routes work to the member it's for", async () => {
    const { crew } = await world();
    expect(crew.starter().map((m) => m.role)).toEqual(["Researcher", "Engineer", "Designer", "Marketer", "Operator"]);
    expect(crew.starter()).toHaveLength(5); // idempotent
    expect(crew.route("Research the market and the competitors for a habit tracker")?.id).toBe("researcher");
    expect(crew.route("Fix the failing test in the api")?.id).toBe("engineer");
    expect(crew.route("Write the launch headline and the waitlist email")?.id).toBe("marketer");
    expect(crew.route("Set up Stripe payments and pricing")?.id).toBe("operator");
    expect(crew.route("hello there")).toBeUndefined();
  });

  it("talks in one standing thread, with the member's persona and model, and its own lessons", async () => {
    const { store, crew, memory, app, seen } = await world();
    crew.set({ id: "sam", name: "Sam", role: "Tester", persona: "You break things on purpose.", runtime: "mock", model: "mock-fast", color: "#fff", emoji: "", triggers: [] });
    memory.teach("Always test the empty input first.", "crew:sam");
    const first = (await post(app, "/api/crew/sam/talk", { text: "Test the empty input of the upload form" })).json().run as string;
    await until(() => ["done", "reviewing"].includes(status(store, first)));
    const spec = seen.find((s) => s.id === first)!;
    expect(spec.system).toContain("You are Sam, the crew's Tester. You break things on purpose.");
    expect(spec.system).toContain("Always test the empty input first."); // the member's own lesson
    expect(spec.model).toBe("mock-fast");
    const again = (await post(app, "/api/crew/sam/talk", { text: "Now try a huge file" })).json().run;
    expect(again).toBe(first); // same standing thread
    expect(fold(store.read(0)).members.sam).toMatchObject({ thread: first, sessions: 1 });
  });
});

it("does not carry a retired provider's model into a Codex-only crew launch", async () => {
  const {crew,store,supervisor}=await world("codex");
  crew.starter();
  const id=supervisor.launch({ask:"Routing test",member:"researcher",hold:true});
  const run=fold(store.read(0)).runs[id]!;
  expect(run.runtime).toBe("codex");
  expect(run.model).toBeUndefined();
});
describe('personal assistant brain: Codex first, Claude as backup', () => {
 const world=(codexStart?:Runtime['start'])=>{
  const store=new EventStore(':memory:');
  const codex=Object.assign(new MockRuntime({pace:0}),{id:'codex'},codexStart?{start:codexStart}:{}),claude=Object.assign(new MockRuntime({pace:0}),{id:'claude'});
  const supervisor=new Supervisor(store,new Map<string,Runtime>([['codex',codex],['claude',claude]]),{workspace:mkdtempSync(path.join(os.tmpdir(),'shua-provider-')),roots:[]});
  cleanups.push(()=>{supervisor.shutdown();store.close();});
  return {store,supervisor};
 };
 const created=(store:EventStore,id:string)=>store.forRun(id).find(e=>e.kind==='run.created')?.body;
 it('starts on Codex while Codex is working, even when Claude was asked for',()=>{
  const {store,supervisor}=world();
  expect(created(store,supervisor.launch({ask:'Hello',labels:['buddy'],hold:true}))).toMatchObject({runtime:'codex'});
  const picked=created(store,supervisor.launch({ask:'Hello',labels:['buddy'],runtime:'claude',model:'mock-fast',hold:true}));
  expect(picked).toMatchObject({runtime:'codex'});expect(picked&&'model' in picked?picked.model:undefined).toBeUndefined();
  expect(created(store,supervisor.launch({ask:'Crew work',runtime:'claude',hold:true}))).toMatchObject({runtime:'claude'});
 });
 it('starts on Claude while Codex is out of its usage window',()=>{
  const {store,supervisor}=world();
  store.append('runtime.limited',{runtime:'codex',until:Date.now()+60_000,message:'limited'});
  expect(created(store,supervisor.launch({ask:'Hello',labels:['buddy'],hold:true}))).toMatchObject({runtime:'claude'});
 });
 it('goes back to Codex the moment Codex reports usage left (a reset plan), not when the old window ends',()=>{
  const {store,supervisor}=world();
  store.append('runtime.limited',{runtime:'codex',until:Date.now()+6*86_400_000,message:'limited until Sunday'});
  expect(created(store,supervisor.launch({ask:'Hello',labels:['buddy'],hold:true}))).toMatchObject({runtime:'claude'});
  supervisor.usageAvailable('codex');
  expect(created(store,supervisor.launch({ask:'Hello again',labels:['buddy'],hold:true}))).toMatchObject({runtime:'codex'});
 });
 it('finishes a turn on Claude when Codex breaks mid-turn',async()=>{
  const {store,supervisor}=world(async function*(){yield {type:'error',message:'Codex app-server exited unexpectedly'};});
  const id=supervisor.launch({ask:'what time is it',labels:['buddy']});
  await until(()=>fold(store.read(0)).runs[id]?.status==='done');
  const routed=store.forRun(id).filter(e=>e.kind==='run.routed');
  expect(routed.map(e=>e.kind==='run.routed'&&e.body.runtime)).toEqual(['claude']);
  expect(store.forRun(id).some(e=>e.kind==='error.raised')).toBe(false);
  // The next conversation skips the broken brain instead of failing first.
  expect(created(store,supervisor.launch({ask:'again',labels:['buddy'],hold:true}))).toMatchObject({runtime:'claude'});
 });
 it('fails once, without bouncing, when both brains break',async()=>{
  const store=new EventStore(':memory:');const broken:Runtime['start']=async function*(){yield {type:'error',message:'network unreachable'};};
  const supervisor=new Supervisor(store,new Map<string,Runtime>([['codex',Object.assign(new MockRuntime({pace:0}),{id:'codex',start:broken})],['claude',Object.assign(new MockRuntime({pace:0}),{id:'claude',start:broken})]]),{workspace:mkdtempSync(path.join(os.tmpdir(),'shua-provider-')),roots:[]});
  cleanups.push(()=>{supervisor.shutdown();store.close();});
  const id=supervisor.launch({ask:'hi',labels:['buddy']});
  await until(()=>fold(store.read(0)).runs[id]?.status==='failed');
  expect(store.forRun(id).filter(e=>e.kind==='run.routed')).toHaveLength(1);
 });
});

describe('backlog: parked until you start it', () => {
 const make=()=>{
  const store=new EventStore(':memory:');
  const mock=Object.assign(new MockRuntime({pace:0}),{id:'mock'});
  const supervisor=new Supervisor(store,new Map<string,Runtime>([['mock',mock]]),{workspace:mkdtempSync(path.join(os.tmpdir(),'shua-backlog-')),roots:[]});
  cleanups.push(()=>{supervisor.shutdown();store.close();});
  return {store,supervisor};
 };
 const status=(store:EventStore,id:string)=>fold(store.read(0)).runs[id]?.status;
 it('stays parked through pumps, provider restores and gateway restarts; starts only when asked',async()=>{
  const {store,supervisor}=make();
  const id=supervisor.launch({ask:'Write the pricing page copy',runtime:'mock',later:true});
  supervisor.pump(); supervisor.restore('mock'); supervisor.recover();
  await new Promise((r)=>setTimeout(r,30));
  expect(status(store,id)).toBe('paused');
  expect(supervisor.inBacklog(id)).toBe(true);
  expect(supervisor.startBacklog(id)).toBe(true);
  await until(()=>status(store,id)==='done');
  expect(supervisor.startBacklog(id)).toBe(false); // already started
 });
});
