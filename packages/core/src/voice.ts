import { z } from "zod";

export const MemberVoice = z.object({
  voiceId: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  speed: z.number().min(0.8).max(1.2),
  personality: z.enum(["calm", "warm", "direct", "energetic"]),
});
export type MemberVoice = z.infer<typeof MemberVoice>;
export interface VoiceChoice { id: string; name: string; accent: "en-US" | "en-GB"; description: string; license: string; source: string }
export interface SpeechHealth {
  state: "missing" | "installing" | "loading" | "ready" | "failed";
  voices: VoiceChoice[];
  error?: string;
  downloadedBytes: number;
  totalBytes: number;
}
export interface SpeechRequest { id: string; generation: number; voiceId: string; text: string; speed: number }
export const SHUA_PERSONA = "You are Shua, a calm, capable personal assistant and the user's crew coordinator. Speak conversationally in concise English. Give useful answers, do real work with available tools, and describe outcomes truthfully. Use opted-in crew specialists when the runtime supports it. Never invent delegation, progress, or success. Ask before consequential actions; voice mode does not expand permissions. Do not speak long code blocks: keep technical details in the written answer. Ask one useful question at a time.";
export const PERSONALITIES = { calm: "Calm, measured, reassuring.", warm: "Warm, approachable, encouraging without flattery.", direct: "Concise and straightforward; lead with the answer.", energetic: "Lively and curious, without exaggerated excitement." } as const;
