import { describe, expect, it } from "vitest";
import { appRoute, paneAnnouncement } from "./pane-model";

describe("pane boundaries", () => {
  it("only links to existing application route shapes", () => {
    expect(appRoute("/sessions/r_123")).toBe("/sessions/r_123");
    expect(appRoute("/settings")).toBe("/settings");
    expect(appRoute("/floor")).toBe("/floor");
    for (const path of ["https://example.com", "//example.com", "/not-a-pane", "/sessions/../settings", "/sessions/%2fsecret", "/sessions/a/b", "/library/missing", "/rooms/room-123", "/ventures/v1", "/plays/p1", "/studio", "/guide"]) {
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
