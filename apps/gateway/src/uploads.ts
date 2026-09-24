/**
 * Files you attach to a message. Each lands in its own folder under the data home, readable only
 * by you, and the agent is handed its path — every runtime can read a file, and Claude reads
 * images and PDFs natively. Nothing about the content goes into the event log.
 */
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface Upload {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
}

export const MAX_UPLOAD = 25 * 1024 * 1024;

const TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", heic: "image/heic",
  pdf: "application/pdf", csv: "text/csv", txt: "text/plain", md: "text/markdown", json: "application/json", log: "text/plain",
  zip: "application/zip", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  mp4: "video/mp4", mov: "video/quicktime", mp3: "audio/mpeg", wav: "audio/wav",
};

export class Uploads {
  constructor(private root: string) {}

  save(name: string, bytes: Buffer): Upload {
    // Keep the name recognisable for the agent, but never let it name a path.
    const safe = path.basename(name).replace(/[^\w.\- ]+/g, "_").replace(/^\.+/, "").slice(0, 120) || "file";
    const id = `u_${randomUUID().slice(0, 12)}`;
    const dir = path.join(this.root, id);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, safe);
    writeFileSync(file, bytes, { mode: 0o600 });
    chmodSync(file, 0o600);
    const upload: Upload = { id, name: safe, path: file, size: bytes.length, type: TYPES[safe.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream" };
    writeFileSync(path.join(dir, ".meta.json"), JSON.stringify(upload), { mode: 0o600 });
    return upload;
  }

  get(id: string): Upload | undefined {
    if (!/^u_[0-9a-f-]{12}$/.test(id)) return undefined;
    const meta = path.join(this.root, id, ".meta.json");
    if (!existsSync(meta)) return undefined;
    return JSON.parse(readFileSync(meta, "utf8")) as Upload;
  }
}
