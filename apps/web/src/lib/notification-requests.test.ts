import { describe, expect, it } from "vitest";
import { settleNotificationRequest } from "./native";

describe("notification bridge responses", () => {
  it("a read refresh cannot unlock controls while a write awaits OS permission", () => {
    expect(settleNotificationRequest("write-1", "read-2", true)).toEqual({ pending: "write-1", busy: true });
    expect(settleNotificationRequest("write-1", "older-read", false)).toEqual({ pending: "write-1", busy: true });
    expect(settleNotificationRequest("write-1", "write-1", false)).toEqual({ pending: null, busy: false });
  });
  it("a remounted settings panel observes an in-flight native write", () => {
    expect(settleNotificationRequest(null, "read", true)).toEqual({ pending: null, busy: true });
    expect(settleNotificationRequest(null, "original-write", false)).toEqual({ pending: null, busy: false });
  });
});
