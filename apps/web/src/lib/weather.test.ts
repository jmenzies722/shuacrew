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
  expect(text).toContain("Sat, Oct 3 (weekend): 66/51°F clear, rain 5%");
});

it("answers a weather question even with the top-bar widget off, and looks up the place once", async () => {
  const { vi } = await import("vitest");
  vi.resetModules();
  const located = vi.fn(async () => ({ lat: 40.7, lon: -73.3 }));
  vi.doMock("./native", () => ({ requestLocation: located }));
  vi.doMock("./api", () => ({ api: async () => ({
    current: { temperature_2m: 70, weather_code: 0, time: "2026-09-30T13:00" },
    hourly: { time: ["2026-09-30T13:00"], temperature_2m: [70], weather_code: [0], precipitation_probability: [0] },
    daily: { time: ["2026-09-30"], temperature_2m_max: [74], temperature_2m_min: [60], weather_code: [0], precipitation_probability_max: [5] },
  }) }));
  const w = await import("./weather");
  expect(w.getWeatherPrefs().enabled).toBe(false);
  expect(await w.weatherForSpark()).toContain("WEATHER for Your location");
  await w.weatherForSpark();
  expect(located).toHaveBeenCalledTimes(1);
  vi.doUnmock("./native"); vi.doUnmock("./api");
});
it("uses °F where the region does, until a unit is picked", async () => {
  const { localUnit } = await import("./weather");
  expect(localUnit("en-US")).toBe("f"); expect(localUnit("en-GB")).toBe("c"); expect(localUnit("fr-FR")).toBe("c"); expect(localUnit("en")).toBe("c");
});

it("tags today, tomorrow and the weekend so Spark doesn't count Friday as the weekend", async () => {
  const { weatherBrief: brief } = await import("./weather");
  const days = ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
  const text = brief({
    current: { temperature_2m: 69, weather_code: 3, time: "2026-09-30T14:00" },
    hourly: { time: ["2026-09-30T14:00"], temperature_2m: [69], weather_code: [3], precipitation_probability: [0] },
    daily: { time: days, temperature_2m_max: [69, 70, 83, 72, 66], temperature_2m_min: [60, 59, 62, 62, 58], weather_code: [3, 3, 51, 3, 51], precipitation_probability_max: [0, 5, 32, 32, 12] },
  }, "Home", "f");
  expect(text).toContain("Wed, Sep 30 (today)"); expect(text).toContain("Thu, Oct 1 (tomorrow)");
  expect(text).toContain("Sat, Oct 3 (weekend)"); expect(text).toContain("Sun, Oct 4 (weekend)");
  expect(text).toMatch(/Fri, Oct 2: /);
});
