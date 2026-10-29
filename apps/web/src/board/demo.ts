import { boardFromLesson } from "../lib/board";

/** A sample lesson for `?demo=1` and the Mac app's board self-test: how a URL shortener serves a click. */
export const DEMO_LESSON = {
  type: "architecture" as const, version: 2 as const, id: "url-shortener", revision: 1,
  title: "How a URL shortener serves a click",
  scope: "Proposed teaching example; not a verified production deployment",
  summary: "Short links are written once and read constantly, so the read path is built around a cache.",
  nodes: [
    { id: "user", label: "User", role: "Clicks a short link", group: "Edge" },
    { id: "cdn", label: "CDN", role: "Caches redirects near users", group: "Edge" },
    { id: "lb", label: "Load balancer", role: "Spreads requests", group: "Edge" },
    { id: "api", label: "Redirect service", role: "Resolves codes to URLs", group: "App" },
    { id: "cache", label: "Redis cache", role: "Hot codes in memory", group: "Data" },
    { id: "db", label: "Postgres", role: "Every link, durable", group: "Data" },
    { id: "queue", label: "Click queue", role: "Buffers click events", group: "App" },
    { id: "worker", label: "Analytics worker", role: "Counts clicks", group: "App" },
  ],
  edges: [
    { id: "visit", from: "user", to: "cdn", label: "GET /abc" },
    { id: "pass", from: "cdn", to: "lb", label: "on a miss" },
    { id: "route", from: "lb", to: "api", label: "routes" },
    { id: "lookup", from: "api", to: "cache", label: "lookup" },
    { id: "fallback", from: "api", to: "db", label: "cache miss" },
    { id: "emit", from: "api", to: "queue", label: "click event" },
    { id: "consume", from: "queue", to: "worker", label: "batches" },
  ],
  steps: [
    { id: "s1", title: "A click arrives", body: "Your click goes to the nearest CDN edge first; most popular links are answered right there.", focus: ["user", "cdn"], edgeFocus: ["visit"] },
    { id: "s2", title: "Into the service", body: "On a miss, the load balancer hands the request to one of the redirect servers.", focus: ["lb", "api"], edgeFocus: ["pass", "route"] },
    { id: "s3", title: "Cache, then database", body: "The service checks Redis first, and only reads Postgres when the code isn't cached.", focus: ["cache", "db"], edgeFocus: ["lookup", "fallback"] },
    { id: "s4", title: "Counting without slowing down", body: "Each click is dropped on a queue, so analytics never delays the redirect.", focus: ["queue", "worker"], edgeFocus: ["emit", "consume"] },
  ],
  example: "bit.ly serves billions of redirects a month this way.",
  followups: ["How is the short code generated?", "What happens when Redis goes down?"],
};
export const DEMO_BOARD = boardFromLesson(DEMO_LESSON);
