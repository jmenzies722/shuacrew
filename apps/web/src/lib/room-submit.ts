import { api, ApiError } from "./api";
export type RoomEnvelope = { requestId: string; text: string; recipient?: string };
export async function submitRoomMessage(pending: Record<string, RoomEnvelope>, room: string, draft: string, recipient?: string) {
  const envelope = pending[room] ?? { requestId: crypto.randomUUID(), text: draft.trim(), recipient };
  if (!envelope.text || envelope.text.length > 8000) throw new Error("Use between 1 and 8000 characters for a crew request.");
  pending[room] = envelope;
  try {
    await api(`/api/rooms/${room}/messages`, { body: envelope });
    delete pending[room];
  } catch (error) {
    // Transport/server failures may have happened after persistence. Keep their ID.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) delete pending[room];
    throw error;
  }
}
