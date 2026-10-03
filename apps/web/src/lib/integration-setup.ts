export function commandArguments(input: string): string[] {
  try {
    const parsed: unknown = JSON.parse(input.trim() || "[]");
    if (Array.isArray(parsed) && parsed.every((argument) => typeof argument === "string")) return parsed;
  } catch {}
  throw new Error("Arguments must be a JSON array of strings");
}
