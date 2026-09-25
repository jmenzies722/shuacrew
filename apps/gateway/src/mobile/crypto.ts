import { createPublicKey, verify } from "node:crypto";
import { decodeEnvelope, signingBytes, type SignedEnvelope } from "@shuacrew/core/mobile";
export function verifyEnvelope(raw: SignedEnvelope, publicKey: string): boolean {
  try {
    const envelope = decodeEnvelope(raw), key = Buffer.from(publicKey, "base64url");
    if (key.length !== 65 || key[0] !== 4 || key.toString("base64url") !== publicKey) return false;
    const parsed = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: key.subarray(1, 33).toString("base64url"), y: key.subarray(33).toString("base64url") } });
    return verify("sha256", signingBytes(envelope.payload), { key: parsed, dsaEncoding: "ieee-p1363" }, Buffer.from(envelope.signature, "base64url"));
  } catch { return false; }
}
