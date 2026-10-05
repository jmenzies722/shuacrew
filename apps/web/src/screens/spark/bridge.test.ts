import { expect, it, vi } from "vitest";

vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
const { playingContext } = await import("./bridge");

it("tells Spark what's playing on every question — the radio, or that nothing is", async () => {
  expect(await playingContext(async () => ({ playing: true, title: "Rainy Window", station: "Lofi Hip-Hop" }))).toBe("ShuaCrew Radio is on: Rainy Window (Lofi Hip-Hop).");
  expect(await playingContext(async () => ({ playing: false, title: null, station: null }))).toMatch(/^Nothing is playing right now/);
});

it("returns only the selected crop and ignores another request's result", async () => {
  const target = new EventTarget(), postMessage = vi.fn();
  vi.stubGlobal("window", Object.assign(target, {webkit:{messageHandlers:{shuacrew:{postMessage}}}}));
  const {selectRegion} = await import("./bridge");
  const pending=selectRegion(), request=postMessage.mock.calls[0]![0].request;
  const send=(detail:unknown)=>target.dispatchEvent(Object.assign(new Event("shuacrew:region"),{detail}));
  send({request:"other",canceled:true});
  send({request,data:btoa("crop"),width:160,height:80});
  const shot=await pending;
  expect(shot).toMatchObject({width:160,height:80,text:[],others:[]});
  expect(await shot!.file.text()).toBe("crop");
});
it("cancels selection without returning any image", async () => {
  const target=new EventTarget(),postMessage=vi.fn();
  vi.stubGlobal("window",Object.assign(target,{webkit:{messageHandlers:{shuacrew:{postMessage}}}}));
  const {selectRegion}=await import("./bridge");
  const pending=selectRegion(),request=postMessage.mock.calls[0]![0].request;
  target.dispatchEvent(Object.assign(new Event("shuacrew:region"),{detail:{request,canceled:true}}));
  expect(await pending).toBeNull();
});
