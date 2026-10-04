export function nameSession(ask: string, suggested?: string): { title: string; titleSource: "explicit" | "suggested" | "derived" } {
  const quote = '(?:"([^"\\n]+)"|“([^”\\n]+)”|\'([^\'\\n]+)\')';
  const named = new RegExp(`(?:\\b(?:session|chat|conversation)\\s+(?:called|named|titled)|\\b(?:call|name|title)\\s+(?:this|the|my)\\s+(?:session|chat|conversation)|^title\\s*:)\\s*${quote}`, "im").exec(ask);
  const requested = named?.slice(1).find(Boolean)?.trim();
  if (requested) return { title: requested, titleSource: "explicit" };
  if (suggested?.trim()) return { title: suggested.replace(/\s+/g, " ").trim(), titleSource: "suggested" };
  let topic = ask.trim().split(/\n|[.!?](?:\s|$)/)[0]?.trim() ?? "";
  for (let pass = 0; pass < 4; pass++) topic = topic.replace(/^(?:(?:hey|hi|ok|okay)[,\s]+|(?:can|could|would) you\s+|(?:please|help me|i want you to|i need you to)\s+)/i, "");
  const words = topic.split(/\s+/).filter(Boolean).slice(0, 7);
  while (words.join(" ").length > 64 && words.length > 1) words.pop();
  const title = words.join(" ").replace(/[,;:—–-]+$/, "").trim();
  return { title: title ? title[0]!.toLocaleUpperCase() + title.slice(1) : "New session", titleSource: "derived" };
}
