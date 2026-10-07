/**
 * Paste anything at Shua — a whole article, a log, a contract — without breaking the turn. Past BIG characters the text
 * goes along as a file Shua reads (in parts, quoting from it) instead of inside the message, where it overflowed the
 * model's context and the turn failed. Your actual question stays in the message: the short paragraph you wrote at the
 * end ("…summarize this") or at the start.
 */
export const BIG = 24_000;
export function bigAsk(text: string, limit = BIG): { ask: string; file?: { name: string; body: string } } {
  const t = text.trim();
  if (t.length <= limit) return { ask: t };
  const paras = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const first = paras[0] ?? "", last = paras.at(-1) ?? "";
  // Your question is the short paragraph that reads like one (ends in "?", or starts like an ask), at the end or the start.
  const asks = (p: string) => p.length <= 600 && (/\?\s*$/.test(p) || /^(please |can you |could you |would you )?(summari[sz]e|explain|review|check|compare|translate|fix|rewrite|evaluate|analy[sz]e|find|tell|give|list|what|why|how|which|who|when|where|is|are|does|do|should|can|could|help)\b/i.test(p));
  const question = paras.length < 2 ? "" : asks(last) ? last : asks(first) ? first : "";
  const size = `${t.length.toLocaleString("en-US")} characters`;
  const ask = `${question || "Here's something long I want you to look at."}\n\n[Pasted text] What I sent is long (${size}), so all of it is attached as a file. Read it from the attachment before you answer — quote it, don't guess — and say if anything you needed was missing.`;
  return { ask, file: { name: "pasted-text.txt", body: t } };
}
