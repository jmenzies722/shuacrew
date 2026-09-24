/**
 * Files you attach to a message. Each lands in its own folder under the data home, readable only
 * by you, and the agent is handed its path — every runtime can read a file, and Claude reads
 * images and PDFs natively. Nothing about the content goes into the event log.
 */
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { kindOf, preparePhoto, prepareVideo, transcribe } from "./media.js";

export interface Upload {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  /** What the agent should read instead of the original: a JPEG, a transcript, a video write-up. */
  agentPath?: string;
  /** A voice note's or video's words, for the chat to show. */
  transcript?: string;
  frames?: number;
  duration?: number;
  /** Processing that didn't work: the file is still attached as-is. */
  note?: string;
}

export const MAX_UPLOAD = 400 * 1024 * 1024; // videos

const TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", heic: "image/heic",
  pdf: "application/pdf", csv: "text/csv", txt: "text/plain", md: "text/markdown", json: "application/json", log: "text/plain",
  zip: "application/zip", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/mp4", mkv: "video/x-matroska", mp3: "audio/mpeg", wav: "audio/wav",
  m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", webm: "audio/webm", flac: "audio/flac", caf: "audio/x-caf", heif: "image/heif",
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

  /**
   * Make a file useful to an agent: photos become JPEGs it can see, voice notes become words,
   * videos become keyframes plus a transcript. If a tool is missing it's attached as-is.
   */
  async process(upload: Upload): Promise<Upload> {
    const kind = kindOf(upload.name);
    const patch: Partial<Upload> = {};
    try {
      if (kind === "photo") {
        const jpg = await preparePhoto(upload.path);
        if (jpg) patch.agentPath = jpg;
      } else if (kind === "audio") {
        const text = await transcribe(upload.path);
        const file = upload.path.replace(/\.[^.]+$/, "") + ".transcript.md";
        writeFileSync(file, `# Voice note: ${upload.name}\n\n${text || "(no speech found)"}\n`, { mode: 0o600 });
        Object.assign(patch, { agentPath: file, transcript: text.slice(0, 4000) });
      } else if (kind === "video") {
        const v = await prepareVideo(upload.path, upload.name);
        Object.assign(patch, { agentPath: v.analysis, transcript: v.transcript?.slice(0, 4000), frames: v.frames.length, duration: Math.round(v.duration) });
      }
    } catch (error) {
      patch.note = (error as Error).message.slice(0, 300);
    }
    if (!Object.keys(patch).length) return upload;
    const done = { ...upload, ...patch };
    writeFileSync(path.join(this.root, upload.id, ".meta.json"), JSON.stringify(done), { mode: 0o600 });
    return done;
  }

}
