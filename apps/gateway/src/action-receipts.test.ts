import { expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventStore } from "./store.js";
it("reserves once across connections and restarts, detects changed payloads, and protects completion ownership", () => {
 const file=join(mkdtempSync(join(tmpdir(),"shua-receipt-")),"test.db");
 const a=new EventStore(file),b=new EventStore(file);
 try {
  expect(a.claimAction("request:1","hash","owner").claimed).toBe(true);
  expect(b.claimAction("request:1","hash","other")).toMatchObject({claimed:false,conflict:false,result:null});
  expect(b.claimAction("request:1","changed","other").conflict).toBe(true);
  expect(b.finishAction("request:1","other",{ok:true,message:"wrong"})).toBe(false);
  expect(a.finishAction("request:1","owner",{ok:true,message:"Created"})).toBe(true);
 } finally {a.close();b.close();}
 const again=new EventStore(file);
 try {expect(again.claimAction("request:1","hash","new")).toMatchObject({claimed:false,result:{ok:true,message:"Created"}});} finally {again.close();}
});
