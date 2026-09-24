/**
 * Attachments ride along in the message text as a short "Attached files" block of paths — the one
 * format every runtime understands (Claude reads images and PDFs by path; any agent can read a
 * file). The chat parses the block back out to show thumbnails instead of paths.
 */
export interface Attachment {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  /** What the agent reads instead: a JPEG, a transcript, a video write-up (see the gateway's media.ts). */
  agentPath?: string;
  transcript?: string;
  frames?: number;
  duration?: number;
  note?: string;
}

const MARK = "Attached files:";
const LINE = /^- (.+?) \(([^,]+), ([\d.]+ ?[KMG]?B)\) · (u_[0-9a-f-]{12})$/;

export async function upload(file: File): Promise<Attachment> {
  const response = await fetch(`/api/uploads?name=${encodeURIComponent(file.name || "pasted.png")}`, {
    method: "POST",
    headers: { "X-ShuaCrew": "1", "Content-Type": "application/octet-stream" },
    body: file,
  });
  const data = (await response.json()) as Attachment & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `upload failed (${response.status})`);
  return data;
}

export const size = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** The message the agent receives: your words, then where to find each file. */
export function withAttachments(text: string, files: Attachment[]): string {
  if (!files.length) return text;
  const body = text.trim() || "Take a look at the attached file" + (files.length > 1 ? "s." : ".");
  return `${body}\n\n${MARK}\n${files.map((f) => `- ${f.agentPath ?? f.path} (${f.type}, ${size(f.size)}) · ${f.id}`).join("\n")}`;
}

/** Split a message back into what you wrote and what you attached. */
export function splitAttachments(text: string): { body: string; files: Attachment[] } {
  const at = text.lastIndexOf(`\n\n${MARK}\n`);
  if (at < 0) return { body: text, files: [] };
  const files: Attachment[] = [];
  for (const line of text.slice(at + MARK.length + 3).split("\n")) {
    const m = LINE.exec(line.trim());
    if (!m) return { body: text, files: [] }; // not our block after all
    // The agent may have been handed a derived file; show the name you attached.
    const name = m[1]!.split("/").pop()!.replace(/\.(analysis|transcript)\.md$|\.agent\.jpg$/, "");
    files.push({ path: m[1]!, name, type: m[2]!, size: 0, id: m[4]! });
  }
  return { body: text.slice(0, at), files };
}
