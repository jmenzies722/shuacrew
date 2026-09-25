/** The desktop buddy's contract with the model: short answers, and an optional place to point on screen. */
export interface Point { x: number; y: number; label: string }

/** A ```point {"x":0..1,"y":0..1,"label":"…"}``` block (normalized to the screenshot), validated. */
export function parsePoint(text: string): Point | null {
  const m = /```point\s*([\s\S]*?)```/i.exec(text);
  if (!m) return null;
  try {
    const v = JSON.parse(m[1]!.trim()) as { x?: unknown; y?: unknown; label?: unknown };
    const x = Number(v.x), y = Number(v.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y, label: typeof v.label === "string" ? v.label.trim().slice(0, 60) : "" };
  } catch { return null; }
}
/** What the bubble shows: the reply without machine-readable blocks. */
export function speakable(text: string) { return text.replace(/```point[\s\S]*?```/gi, "").trim(); }

export function buddyPrompt(question: string, screen: { width: number; height: number } | null) {
  return [
    "You are Spark, the user's friendly desktop buddy inside ShuaCrew. Be warm, quick and concrete: answer in at most ~120 words, plain language, steps as a short list when needed. Do not use tools except to read the attached screenshot.",
    screen
      ? `The attached image is the user's screen right now (${screen.width}×${screen.height}). Ground your answer in what is actually visible. If pointing at one thing on screen would help (a button, menu, field, line), add exactly one block: \`\`\`point {"x": 0.0-1.0, "y": 0.0-1.0, "label": "2–5 words"}\`\`\` with x,y the CENTER of that thing as fractions of the image width and height. If nothing needs pointing at, don't add it.`
      : "No screenshot this time; answer from the question alone.",
    `\nThe user asks: ${question}`,
  ].join("\n");
}
