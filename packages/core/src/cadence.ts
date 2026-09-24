/**
 * Cadences the way people say them — "weekdays 9am ET", "every 15m", "mon 8:30" — as five-field
 * cron plus an IANA timezone. Anything that isn't recognised is refused with an example, never
 * guessed: a schedule that fires at the wrong time is worse than one that doesn't save.
 */

const ZONES: Record<string, string> = {
  et: "America/New_York",
  est: "America/New_York",
  edt: "America/New_York",
  ct: "America/Chicago",
  cst: "America/Chicago",
  cdt: "America/Chicago",
  mt: "America/Denver",
  mst: "America/Denver",
  pt: "America/Los_Angeles",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  utc: "UTC",
  gmt: "UTC",
  uk: "Europe/London",
  cet: "Europe/Paris",
};

const DAYS: Record<string, string> = { sun: "0", mon: "1", tue: "2", wed: "3", thu: "4", fri: "5", sat: "6" };

export interface Cadence {
  cron: string;
  timezone?: string;
  /** How it reads back to a person. */
  words: string;
}

export function parseCadence(input: string): Cadence {
  let text = input.trim().toLowerCase().replace(/\s+/g, " ");
  let timezone: string | undefined;
  const zone = /\s([a-z]{2,4}|[a-z]+\/[a-z_]+)$/.exec(text);
  if (zone?.[1] && (ZONES[zone[1]] || zone[1].includes("/"))) {
    timezone = ZONES[zone[1]] ?? input.trim().split(/\s+/).pop();
    text = text.slice(0, zone.index).trim();
  }

  if (/^(\S+\s+){4}\S+$/.test(text) && /^[\d*/,\-\s]+$/.test(text)) return { cron: text, timezone, words: `cron ${text}` };
  if (text === "hourly" || text === "every hour") return { cron: "0 * * * *", timezone, words: "every hour" };

  const every = /^every (\d+) ?(m|min|mins|minutes?|h|hr|hrs|hours?)$/.exec(text);
  if (every) {
    const n = Number(every[1]);
    if (every[2]!.startsWith("m")) {
      if (n < 1 || n > 59 || 60 % n) throw new Error("every N minutes needs N dividing 60 — e.g. every 5m, 15m, 30m");
      return { cron: `*/${n} * * * *`, timezone, words: `every ${n} minutes` };
    }
    if (n < 1 || n > 23 || 24 % n) throw new Error("every N hours needs N dividing 24 — e.g. every 2h, 6h, 12h");
    return { cron: `0 */${n} * * *`, timezone, words: `every ${n} hours` };
  }

  const at = /^(daily|every day|weekdays|weekends|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*(?:,(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*)*) (?:at )?(\d{1,2})(?::(\d{2}))? ?(am|pm)?$/.exec(text);
  if (at) {
    let hour = Number(at[2]);
    const minute = Number(at[3] ?? 0);
    if (at[4] === "pm" && hour < 12) hour += 12;
    if (at[4] === "am" && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) throw new Error(`no such time: ${at[2]}:${at[3] ?? "00"}`);
    const which = at[1]!;
    const days =
      which === "daily" || which === "every day"
        ? "*"
        : which === "weekdays"
          ? "1-5"
          : which === "weekends"
            ? "0,6"
            : which
                .split(",")
                .map((d) => DAYS[d.slice(0, 3)])
                .join(",");
    const time = `${at[4] ? ((hour + 11) % 12) + 1 : hour}:${String(minute).padStart(2, "0")}${at[4] ?? ""}`;
    return { cron: `${minute} ${hour} * * ${days}`, timezone, words: `${which} at ${time}${timezone ? ` ${timezone}` : ""}` };
  }
  throw new Error(`can't read "${input}" — try "every 15m", "hourly", "daily 9am", "weekdays 9:30am ET", "mon,thu 8am" or cron`);
}
