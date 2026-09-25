export async function readSpeechStream(stream: ReadableStream<Uint8Array>, identity: { id: string; generation: number }, signal: AbortSignal, audio: (data: ArrayBuffer) => Promise<void>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "", bytes = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) throw new Error("Speech stream ended before completion.");
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 4 * 1024 * 1024) throw new Error("Speech chunk is too large.");
      for (;;) {
        const end = buffer.indexOf("\n");
        if (end < 0) break;
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        const item = JSON.parse(line);
        if (item.type === "error") throw new Error(typeof item.error === "string" ? item.error : "Speech failed.");
        if (item.id !== identity.id || item.generation !== identity.generation) throw new Error("Unexpected speech response.");
        if (item.type === "done") return;
        if (item.type !== "audio" || typeof item.data !== "string") throw new Error("Invalid speech response.");
        const binary = atob(item.data);
        bytes += binary.length;
        if (bytes > 16 * 1024 * 1024) throw new Error("Speech response is too large.");
        const data = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
        signal.throwIfAborted();
        await audio(data.buffer);
      }
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
