import { createHash } from "node:crypto";

/** Canonical JSON of the LIVE input; never hash the redacted audit projection. */
export function inputDigest(input: unknown): string {
  const seen = new Set<object>();
  function encode(value: unknown, depth: number): string {
    if (depth > 64) throw new Error("Input nesting exceeds limit");
    if (value === null) return "null";
    if (typeof value === "string") {
      if (/[\uD800-\uDFFF]/u.test(value)) throw new Error("Invalid input Unicode");
      return JSON.stringify(value);
    }
    if (typeof value === "boolean") return String(value);
    if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
    if (typeof value !== "object") throw new Error("Input is not finite JSON");
    if (seen.has(value)) throw new Error("Cyclic input");
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw new Error("Input is not plain JSON");
    seen.add(value);
    let encoded: string;
    if (Array.isArray(value)) {
      const elements: string[] = [];
      for (let i = 0; i < value.length; i++) elements.push(encode(value[i], depth + 1));
      encoded = `[${elements.join(",")}]`;
    } else {
      encoded = `{${Object.keys(value).sort().map(key => `${encode(key, depth + 1)}:${encode((value as Record<string, unknown>)[key], depth + 1)}`).join(",")}}`;
    }
    seen.delete(value);
    return encoded;
  }
  return createHash("sha256").update(encode(input, 0)).digest("hex");
}
