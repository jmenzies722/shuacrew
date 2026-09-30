import type { FastifyInstance } from "fastify";

/** Weather for the top bar, fetched by the gateway so the page keeps its strict connect-src 'self'.
 * Only rounded coordinates or a short city name are sent to Open-Meteo (free, no account). */
export function weatherRoutes(app: FastifyInstance, fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { at: number; body: unknown }>();
  const get = async (url: string) => {
    const hit = cache.get(url); if (hit && Date.now() - hit.at < 10 * 60_000) return hit.body;
    const res = await fetcher(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Weather service said ${res.status}`);
    const body = await res.json(); cache.set(url, { at: Date.now(), body });
    if (cache.size > 50) cache.delete(cache.keys().next().value!);
    return body;
  };
  app.get<{ Querystring: { lat?: string; lon?: string; unit?: string; days?: string } }>("/api/weather/forecast", async (req, reply) => {
    const lat = Math.round(Number(req.query.lat) * 100) / 100, lon = Math.round(Number(req.query.lon) * 100) / 100;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return reply.code(400).send({ error: "lat/lon" });
    const f = req.query.unit === "f" ? "&temperature_unit=fahrenheit&wind_speed_unit=mph" : "";
    // The top bar needs two days; Spark answering "this weekend" needs the week.
    const days = Math.min(7, Math.max(1, Math.round(Number(req.query.days) || 2)));
    try { return await get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day,wind_speed_10m&hourly=temperature_2m,weather_code,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&forecast_days=${days}&timezone=auto${f}`); }
    catch (e) { return reply.code(502).send({ error: (e as Error).message }); }
  });
  app.get<{ Querystring: { q?: string } }>("/api/weather/geocode", async (req, reply) => {
    const q = (req.query.q ?? "").trim().slice(0, 80);
    if (!q || !/^[\p{L}\p{N} .,'-]+$/u.test(q)) return reply.code(400).send({ error: "city" });
    try { return await get(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(q)}`); }
    catch (e) { return reply.code(502).send({ error: (e as Error).message }); }
  });
}
