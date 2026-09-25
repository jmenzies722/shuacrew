import { constants, openSync, closeSync, fstatSync, readFileSync } from "node:fs";
import { z } from "zod";
import { parseStrictJSON } from "@shuacrew/core/mobile";
import type { EventStore } from "../store.js";
import type { Supervisor } from "../runs.js";
import type { RoomCoordinator } from "../rooms.js";
import { MobileAuthority } from "./authority.js";
import type { MobileRoutesOptions } from "./routes.js";

const schema = z.object({ version: z.literal(1), installationId: z.string().uuid(), credential: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export function readNativeBridge(file: string): z.infer<typeof schema> | undefined {
  let fd: number;
  try { fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw new Error("Native bridge file unavailable"); }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 2048 || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) throw new Error("Native bridge file must be private and owned by this user");
    return schema.parse(parseStrictJSON(readFileSync(fd, "utf8"), 2048));
  } finally { closeSync(fd); }
}
/** Re-read private provisioning at request time; no restart and no secret in browser content. */
export function nativeBridgeSource(file: string, store: EventStore, supervisor: Supervisor, rooms: RoomCoordinator) {
  let current: { installationId: string; options: MobileRoutesOptions } | undefined;
  return (): MobileRoutesOptions | undefined => {
    const config = readNativeBridge(file);
    if (!config) { current = undefined; return undefined; }
    if (!current || current.installationId !== config.installationId) {
      current = { installationId: config.installationId, options: { authority: new MobileAuthority(store, supervisor, rooms, { installationId: config.installationId }), bridgeCredential: config.credential } };
    }
    current.options.bridgeCredential = config.credential;
    return current.options;
  };
}
