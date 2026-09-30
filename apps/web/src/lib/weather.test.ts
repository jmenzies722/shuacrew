import { expect, it } from "vitest";
import { asksWeather, describe as wx, weatherBrief } from "./weather";
it("maps WMO codes to labels and day/night icons", () => {
  expect(wx(0, true)).toEqual({ label: "Clear", icon: "sun" }); expect(wx(0, false).icon).toBe("moon");
  expect(wx(2).label).toBe("Partly cloudy"); expect(wx(61).icon).toBe("rain"); expect(wx(81).icon).toBe("rain");
  expect(wx(73).icon).toBe("snow"); expect(wx(95).icon).toBe("storm"); expect(wx(45).icon).toBe("fog");
});

it("knows a weather question when it hears one, and leaves other questions alone", () => {
  for (const q of ["what's the weather tomorrow", "do I need an umbrella", "how hot is it this weekend", "will it snow", "weekend forecast"]) expect(asksWeather(q)).toBe(true);
  for (const q of ["play something chill", "who won the Knicks game", "open Safari", "brainstorm names"]) expect(asksWeather(q)).toBe(false);
});
it("briefs Spark with now, the next 12 hours and the week, so it answers without a web search", () => {
  const hours = Array.from({ length: 48 }, (_, i) => `2026-09-30T${String(i % 24).padStart(2, "0")}:00`);
  const text = weatherBrief({
    current: { temperature_2m: 68.4, weather_code: 3, time: "2026-09-30T13:15" },
    hourly: { time: hours, temperature_2m: hours.map((_, i) => 60 + (i % 24)), weather_code: hours.map(() => 61), precipitation_probability: hours.map(() => 40) },
    daily: { time: ["2026-09-30", "2026-10-03"], temperature_2m_max: [73.2, 66], temperature_2m_min: [59.8, 51], weather_code: [3, 0], precipitation_probability_max: [40, 5] },
  }, "North Babylon", "f");
  expect(text).toContain("WEATHER for North Babylon");
  expect(text).toContain("no web search");
  expect(text).toContain("Now: 68°F");
  expect(text).toMatch(/Next 12 hours: 13:00 73° .* 40%/);
  expect(text).toContain("Sat, Oct 3: 66/51°F clear, rain 5%");
});
