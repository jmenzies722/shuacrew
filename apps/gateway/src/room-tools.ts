import { AssignmentInputSchema } from "@shuacrew/core/rooms";
import { z } from "zod";
import type { RoomCoordinator } from "./rooms.js";

export const ROOM_TOOLS = [
  { name: "crew_delegate", description: "Assign a concrete task to an opted-in room member. Returns real assignment/run IDs. Finish your turn after delegating; results arrive as one follow-up. Do not poll.", inputSchema: { type: "object", properties: { requestId: { type: "string", description: "Unique UUID; reuse only for retrying this identical tool request" }, memberId: { type: "string" }, task: { type: "string" } }, required: ["requestId", "memberId", "task"], additionalProperties: false } },
  { name: "crew_status", description: "Inspect the actual room assignments and results. Does not launch work.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "crew_message", description: "Post a useful progress message under your real identity. Does not delegate work or authorize tools.", inputSchema: { type: "object", properties: { requestId: { type: "string" }, text: { type: "string" } }, required: ["requestId", "text"], additionalProperties: false } },
];
export function callRoomTool(rooms: RoomCoordinator, name: string, input: unknown, sourceRun: string): string {
  if (name === "crew_delegate") return JSON.stringify(rooms.delegate(sourceRun, AssignmentInputSchema.strict().parse(input)));
  if (name === "crew_status") { z.object({}).strict().parse(input); return JSON.stringify(rooms.status(sourceRun)); }
  if (name === "crew_message") { const args = z.object({ requestId: z.string().uuid(), text: z.string().trim().min(1).max(8000) }).strict().parse(input); return JSON.stringify(rooms.message(sourceRun, args.requestId, args.text)); }
  throw new Error("Unknown room tool");
}
