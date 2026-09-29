import { generateKeyPairSync, sign } from "node:crypto";
import { expect, it } from "vitest";
import { verifyEnvelope } from "./crypto.js";
import { signingBytes } from "@shuacrew/core/mobile";
import { readFileSync } from "node:fs";
it("verifies the persisted CryptoKit-generated signature vector", () => {
  const vector = JSON.parse(readFileSync(new URL("../../../../fixtures/mobile/swift-envelope.json", import.meta.url), "utf8"));
  expect(verifyEnvelope(vector.envelope, vector.publicKey)).toBe(true);
});
it("verifies P256 exact payload bytes and rejects tampering and wrong keys", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const key = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
  const payload = '{"version":1}';
  const envelope = { payload, signature: sign("sha256", signingBytes(payload), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url") };
  expect(verifyEnvelope(envelope, key)).toBe(true);
  expect(verifyEnvelope({ ...envelope, payload: payload + " " }, key)).toBe(false);
  expect(verifyEnvelope(envelope, "A".repeat(87))).toBe(false);
  expect(verifyEnvelope({ ...envelope, signature: "bad" }, key)).toBe(false);
});
