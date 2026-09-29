import { MobileSnapshotSchema, type MobileSnapshot } from "@shuacrew/core/mobile";

/** Watch-sized signed observations. Offers remain exact; transcripts stay on phone/Mac. */
export function compactForWatch(source: MobileSnapshot): MobileSnapshot {
  const value: MobileSnapshot = { ...source,
    rooms: source.rooms.slice(0, 10).map(room => ({ ...room, messages: [], truncated: room.truncated || room.messages.length > 0 })),
    runs: source.runs.slice(0, 10).map(run => ({ ...run, summary: Array.from(run.summary).slice(0, 128).join("") })),
    offers: source.offers.filter(offer => !offer.requiresPhone).slice(0, 5),
    truncated: source.truncated || source.rooms.length > 10 || source.rooms.some(room => room.messages.length > 0)
      || source.runs.length > 10 || source.runs.some(run => Array.from(run.summary).length > 128)
      || source.offers.length > 5 || source.offers.some(offer => offer.requiresPhone),
  };
  while (Buffer.byteLength(JSON.stringify(value)) > 8000) {
    value.truncated = true;
    if (value.runs.length > 2) value.runs.pop();
    else if (value.rooms.length > 2) value.rooms.pop();
    else if (value.offers.length) value.offers.pop();
    else if (value.runs.length) value.runs.pop();
    else if (value.rooms.length) value.rooms.pop();
    else throw new Error("Watch snapshot cannot fit transport");
  }
  return MobileSnapshotSchema.parse(value);
}
