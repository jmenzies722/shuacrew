import { validateQueueInput, type RoomQueueInput, type RoomQueueEntry } from "@shuacrew/core/room-queue";
import { api, ApiError } from "./api";

/** Retain identity across uncertain delivery; a retry must never become fresh work. */
export async function enqueueRoomMessage(pending: Record<string, RoomQueueInput>, room: string, text: string, recipient?: string, replyTo?: string) {
  const now = Date.now();
  const original = pending[room];
  const envelope = original ?? validateQueueInput({ requestId: crypto.randomUUID(), text: text.trim(), recipient, replyTo, issuedAt: now, expiresAt: now + 86400000 }, now);
  // An expired retry can still retrieve a previously accepted receipt from the owner.
  pending[room] = envelope;
  try {
    const receipt = await api<RoomQueueEntry>(`/api/rooms/${encodeURIComponent(room)}/queue`, { body: envelope });
    delete pending[room];
    return { receipt, submitted: envelope };
  } catch (error) {
    // Conflict may mean an existing identity. Never replace it automatically.
    if (error instanceof ApiError && [400, 401, 403, 404].includes(error.status)) delete pending[room];
    throw error;
  }
}
