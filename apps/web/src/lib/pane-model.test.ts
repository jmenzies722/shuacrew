import { describe, expect, it } from "vitest";
import { appRoute, paneAnnouncement } from "./pane-model";

describe("pane boundaries", () => {
  it("only links to existing application route shapes", () => {
    expect(appRoute("/rooms/room-123")).toBe("/rooms/room-123");
    expect(appRoute("/settings")).toBe("/settings");
    expect(appRoute("/studio")).toBe("/studio");
    for (const path of ["https://example.com", "//example.com", "/not-a-pane", "/rooms/../settings", "/rooms/%2fsecret", "/rooms/a/b", "/library/missing"]) {
      expect(appRoute(path)).toBeNull();
    }
  });
  it("announces failures without making static empty states live regions", () => {
    expect(paneAnnouncement("error")).toBe("alert");
    expect(paneAnnouncement("offline")).toBe("status");
    expect(paneAnnouncement("loading")).toBe("status");
    expect(paneAnnouncement("empty")).toBeUndefined();
  });
});
