import { expect, it } from "vitest";
import { PANES, findPane, paneURL } from "./settings-panes";
import { producerMove } from "./studio";
import { parseActions } from "./buddy";

it("finds the exact page from how people ask", () => {
  expect(findPane("night shift")?.key).toBe("displays");
  expect(findPane("wi-fi settings")?.key).toBe("wifi");
  expect(findPane("dark mode")?.key).toBe("appearance");
  expect(findPane("screen recording permission")?.key).toBe("screen-recording");
  expect(findPane("my airpods")?.key).toBe("bluetooth");
  expect(findPane("a sandwich")).toBeNull();
});
it("links straight to the page, and to the exact privacy switch", () => {
  expect(paneURL(PANES.find((p) => p.key === "wifi")!)).toBe("x-apple.systempreferences:com.apple.wifi-settings-extension");
  expect(paneURL(PANES.find((p) => p.key === "full-disk-access")!)).toBe("x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles");
  expect(new Set(PANES.map((p) => p.key)).size).toBe(PANES.length);
});
it("opens settings instantly by asking, and Spark can do it too", () => {
  expect(producerMove("open wifi settings")).toEqual({ kind: "settings", pane: "wifi" });
  expect(producerMove("hey shua take me to night shift")).toEqual({ kind: "settings", pane: "displays" });
  expect(producerMove("where do I change my wallpaper")).toEqual({ kind: "settings", pane: "wallpaper" });
  expect(producerMove("open full disk access")).toEqual({ kind: "settings", pane: "full-disk-access" });
  expect(producerMove("open safari")).toBeNull();
  expect(producerMove("open music artist by drake")).toMatchObject({ kind: "browse" });
  expect(parseActions('```do [{"type":"open_settings","pane":"displays"},{"type":"open_settings","pane":"hack"}]```')).toEqual([{ type: "open_settings", pane: "displays" }]);
});
