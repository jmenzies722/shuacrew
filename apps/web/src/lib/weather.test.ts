import { expect, it } from "vitest";
import { describe as wx } from "./weather";
it("maps WMO codes to labels and day/night icons", () => {
  expect(wx(0, true)).toEqual({ label: "Clear", icon: "sun" }); expect(wx(0, false).icon).toBe("moon");
  expect(wx(2).label).toBe("Partly cloudy"); expect(wx(61).icon).toBe("rain"); expect(wx(81).icon).toBe("rain");
  expect(wx(73).icon).toBe("snow"); expect(wx(95).icon).toBe("storm"); expect(wx(45).icon).toBe("fog");
});
