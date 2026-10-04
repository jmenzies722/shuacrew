export type CalculatorRequest = { left: string; right: string; expected: string };
export function parseCalculatorRequest(text: string): CalculatorRequest | null {
  const match = text.trim().match(/^(?:please\s+)?(?:open\s+(?:the\s+)?calculator\s+(?:and\s+)?)?(?:calculate|compute)\s+(\d{1,3})\s*(?:×|x|\*|times|multiplied by)\s*(\d{1,3})[.!?]?$/i);
  if (!match) return null;
  const left = String(Number(match[1])), right = String(Number(match[2]));
  return { left, right, expected: String(BigInt(left) * BigInt(right)) };
}
export function calculatorSequence(request: CalculatorRequest): Array<{ label: string; expected: string[] }> {
  const sequence = [{ label: "Open Calculator", expected: [] as string[] }, { label: "All Clear", expected: ["0"] }];
  [...request.left].forEach((digit, index) => sequence.push({ label: digit, expected: [request.left.slice(0, index + 1)] }));
  sequence.push({ label: "Enter", expected: [request.left, request.left] });
  [...request.right].forEach((digit, index) => sequence.push({ label: digit, expected: [request.left, request.right.slice(0, index + 1)] }));
  sequence.push({ label: "Multiply", expected: [request.expected] });
  return sequence;
}
