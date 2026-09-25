import { createHash, createPublicKey, randomUUID } from "node:crypto";
import { fold, redact, type AnyEvent } from "@shuacrew/core";
import { ApprovalOfferSchema, MobileCommandSchema, MobileDeviceSchema, MobileConfigSchema, decodeEnvelope, parseStrictJSON, type ApprovalOffer, type MobileAck, type MobileDevice, type SignedEnvelope } from "@shuacrew/core/mobile";
import type { EventStore } from "../store.js";
import type { Supervisor } from "../runs.js";
import type { RoomCoordinator } from "../rooms.js";
import { verifyEnvelope } from "./crypto.js";
import { inputDigest } from "./digest.js";
import { projectMobile } from "./projection.js";
import { compactForWatch } from "./watch-projection.js";

type Receipt = Extract<AnyEvent, { kind: "mobile.received" }>["body"];
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const requireStableIdentity = (...values: (string | undefined)[]) => {
  // The audit redactor remains mandatory; protocol identities must survive it unchanged.
  if (values.some(value => value !== undefined && redact(value) !== value)) throw new Error("Unsupported mobile identity");
};

/** Local execution authority. Transport alone never authorizes a device or an action. */
export class MobileAuthority {
  private processing = new Set<string>();
  constructor(private store: EventStore, private supervisor: Supervisor, private rooms: RoomCoordinator, private options: { installationId: string }) {
    requireStableIdentity(options.installationId);
  }

  config() {
    const events = this.store.ofKinds("mobile.configured").filter(e => e.kind === "mobile.configured" && e.body.installationId === this.options.installationId);
    const last = events.at(-1);
    return last?.kind === "mobile.configured" ? { enabled: last.body.enabled, roomIds: last.body.roomIds } : { enabled: false, roomIds: [] as string[] };
  }
  configure(value: { enabled: boolean; roomIds: string[] }) {
    const config = MobileConfigSchema.parse(value);
    if (new Set(config.roomIds).size !== config.roomIds.length || config.roomIds.some(id => !this.rooms.get(id))) throw new Error("Invalid room scope");
    this.store.append("mobile.configured", { ...config, installationId: this.options.installationId });
  }
  devices(): MobileDevice[] {
    const devices = new Map<string, MobileDevice>();
    for (const event of this.store.read(0)) {
      if (event.kind === "mobile.paired" && event.body.installationId === this.options.installationId) {
        const { installationId: _, ...device } = event.body;
        devices.set(device.id, MobileDeviceSchema.parse(device));
      }
      if (event.kind === "mobile.revoked" && event.body.installationId === this.options.installationId) devices.delete(event.body.deviceId);
    }
    return [...devices.values()];
  }
  pair(raw: MobileDevice) {
    if (!this.config().enabled) throw new Error("Mobile access disabled");
    const device = MobileDeviceSchema.parse(raw), bytes = Buffer.from(device.publicKey, "base64url");
    requireStableIdentity(device.id, device.publicKey);
    if (bytes.length !== 65 || bytes[0] !== 4 || bytes.toString("base64url") !== device.publicKey) throw new Error("Invalid device key");
    createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: bytes.subarray(1, 33).toString("base64url"), y: bytes.subarray(33).toString("base64url") } });
    // IDs may not be recycled: otherwise a replacement key could inherit old offers and acks.
    if (this.store.ofKinds("mobile.paired").some(e => e.kind === "mobile.paired" && e.body.installationId === this.options.installationId && (e.body.id === device.id || e.body.publicKey === device.publicKey))) throw new Error("Device already paired; use a new identity after revocation");
    if (this.devices().length >= 20) throw new Error("Device limit reached");
    this.store.append("mobile.paired", { ...device, installationId: this.options.installationId });
  }
  revoke(deviceId: string) {
    if (!this.devices().some(d => d.id === deviceId)) throw new Error("Device not paired");
    this.store.append("mobile.revoked", { deviceId, installationId: this.options.installationId });
  }
  revocations(after: number) {
    if (!Number.isSafeInteger(after) || after < 0) throw new Error("Invalid revocation cursor");
    return this.store.ofKinds("mobile.revoked")
      .filter(e => e.kind === "mobile.revoked")
      .filter(e => e.body.installationId === this.options.installationId && e.seq > after)
      .slice(0, 100).map(e => ({ deviceId: e.body.deviceId, at: e.at, sequence: e.seq }));
  }
  private scopedRun(runId: string): boolean {
    const run = fold(this.store.read(0)).runs[runId];
    return !!run && !run.incognito && run.runtime !== "mock" && run.labels.some(label => label.startsWith("room:") && this.config().roomIds.includes(label.slice(5)));
  }
  offers(deviceId: string, now = Date.now()): ApprovalOffer[] {
    if (!this.config().enabled) return [];
    const device = this.devices().find(d => d.id === deviceId); if (!device) return [];
    const offers: ApprovalOffer[] = [];
    for (const id of this.supervisor.pendingApprovals()) {
      const live = this.supervisor.liveApproval(id);
      if (!live || !this.scopedRun(live.run) || live.risk === "high" || live.risk === "critical" || (device.kind === "watch" && live.risk !== "low")) continue;
      // A deliberately narrow display adapter. Unknown payloads stay on the Mac.
      const input = live.input as Record<string, unknown> | null;
      if (live.tool !== "Bash" || !input || Object.keys(input).length !== 1 || typeof input.command !== "string" || !input.command.trim() || /[\r\n\x00-\x1f\x7f]/.test(input.command) || Buffer.byteLength(input.command) > 1000 || redact(input.command) !== input.command) continue;
      const digest = inputDigest(input);
      const previous = this.store.ofKinds("mobile.offer").find(e => e.kind === "mobile.offer" && e.body.deviceId === deviceId && e.body.approvalId === id && e.body.inputDigest === digest && e.body.expiresAt > now && e.body.issuedAt <= now);
      const offer = previous?.kind === "mobile.offer" ? previous.body : ApprovalOfferSchema.parse({ version: 1, installationId: this.options.installationId, deviceId, offerId: `offer_${randomUUID()}`, runId: live.run, approvalId: id, tool: live.tool, inputDigest: digest, summary: `Run this exact shell command on the Mac: ${input.command}`, nonce: randomUUID(), issuedAt: now, expiresAt: now + 300000, requiresPhone: live.risk !== "low" });
      if (!previous) this.store.append("mobile.offer", offer);
      offers.push(offer);
      if (offers.length === 50) break;
    }
    return offers;
  }
  snapshot(deviceId: string, now = Date.now()) {
    const config = this.config();
    const device = this.devices().find(d => d.id === deviceId);
    if (!config.enabled || !device) throw new Error("Mobile access disabled or device unpaired");
    const snapshot = projectMobile(this.store, { ...this.options, deviceId, roomIds: config.roomIds, offers: this.offers(deviceId, now), now });
    return device.kind === "watch" ? compactForWatch(snapshot) : snapshot;
  }
  private acknowledgment(receipt: Receipt, state: MobileAck["state"], reason: string, now: number): MobileAck {
    const ack: MobileAck = { version: 1, installationId: receipt.installationId, deviceId: receipt.deviceId, commandId: receipt.commandId, payloadDigest: receipt.payloadDigest, state, reason, at: now };
    this.store.append("mobile.ack", ack); return ack;
  }
  private existingAck(receipt: Receipt): MobileAck | undefined {
    const event = this.store.ofKinds("mobile.ack").find(e => e.kind === "mobile.ack" && e.body.installationId === receipt.installationId && e.body.deviceId === receipt.deviceId && e.body.commandId === receipt.commandId);
    return event?.kind === "mobile.ack" ? event.body : undefined;
  }
  private recoverReceipt(receipt: Receipt, now: number): MobileAck {
    let reason = "inspect-on-mac", applied = false;
    if (receipt.kind === "approval") {
      applied = this.store.ofKinds("approval.decided").some(e => e.kind === "approval.decided" && e.body.mobileCommandId === receipt.marker);
      if (applied) reason = "decision-recorded";
    } else if (receipt.kind === "room-message") {
      const room = receipt.target && this.rooms.get(receipt.target);
      const turn = room && room.turns.find(t => t.requestId === receipt.requestId);
      applied = !!turn && this.store.forRun(turn.runId).some(e => e.kind === "run.created");
      if (applied) reason = "message-recorded";
    } else if (receipt.kind === "room-pause") {
      applied = !!receipt.target && this.rooms.get(receipt.target)?.paused === receipt.paused;
      if (applied) reason = "room-state-recorded";
    } else if (receipt.kind === "run-stop") {
      applied = !!receipt.target && fold(this.store.read(0)).runs[receipt.target]?.status === "cancelled";
      if (applied) reason = "stop-recorded";
    } else if (receipt.kind === "refresh") { applied = true; reason = "snapshot-requested"; }
    return this.acknowledgment(receipt, applied ? "applied" : "uncertain", reason, now);
  }
  recover(now = Date.now()) {
    for (const event of this.store.ofKinds("mobile.received")) if (event.kind === "mobile.received" && event.body.installationId === this.options.installationId && !this.existingAck(event.body) && !this.processing.has(event.body.marker)) this.recoverReceipt(event.body, now);
  }
  receive(raw: SignedEnvelope, now = Date.now()): MobileAck {
    if (!this.config().enabled) throw new Error("Mobile access disabled");
    const envelope = decodeEnvelope(raw);
    // Select the signer cryptographically BEFORE interpreting its signed JSON.
    const signer = this.devices().find(d => verifyEnvelope(envelope, d.publicKey));
    if (!signer) throw new Error("Unpaired or invalid signature");
    const command = MobileCommandSchema.parse(parseStrictJSON(envelope.payload));
    if (command.deviceId !== signer.id || command.installationId !== this.options.installationId) throw new Error("Wrong command audience");
    const action = command.action;
    const marker = hash(`${command.installationId}:${command.deviceId}:${command.commandId}`);
    const target = action.kind === "approval" ? action.offer.approvalId : action.kind === "run-stop" ? action.runId : action.kind === "room-message" || action.kind === "room-pause" ? action.roomId : undefined;
    requireStableIdentity(command.installationId, command.deviceId, command.commandId, target);
    const receipt: Receipt = { installationId: command.installationId, deviceId: signer.id, commandId: command.commandId, payloadDigest: hash(envelope.payload), kind: action.kind, marker, target, ...(action.kind === "room-pause" ? { paused: action.paused } : {}), ...(action.kind === "room-message" ? { requestId: `${marker.slice(0, 8)}-${marker.slice(8, 12)}-4${marker.slice(13, 16)}-a${marker.slice(17, 20)}-${marker.slice(20, 32)}` } : {}) };
    if (this.processing.has(marker)) throw new Error("Command already processing");
    const old = this.store.ofKinds("mobile.received").find(e => e.kind === "mobile.received" && e.body.marker === marker);
    if (old?.kind === "mobile.received") {
      if (old.body.payloadDigest !== receipt.payloadDigest) return { version: 1, installationId: receipt.installationId, deviceId: receipt.deviceId, commandId: receipt.commandId, payloadDigest: receipt.payloadDigest, state: "rejected", reason: "command-conflict", at: now };
      return this.existingAck(receipt) ?? this.recoverReceipt(old.body, now);
    }
    this.processing.add(marker);
    try {
      this.store.append("mobile.received", receipt);
      if (command.expiresAt <= now) return this.acknowledgment(receipt, "expired", "command-expired", now);
      if (command.issuedAt > now) return this.acknowledgment(receipt, "rejected", "future-command", now);
      if (action.kind === "approval") {
        const offer = action.offer;
        const recorded = this.store.ofKinds("mobile.offer").some(e => e.kind === "mobile.offer" && inputDigest(e.body) === inputDigest(offer));
        if (!recorded || !this.scopedRun(offer.runId) || (offer.requiresPhone && signer.kind !== "phone")) return this.acknowledgment(receipt, "rejected", "invalid-offer", now);
        const applied = this.supervisor.decideLiveApproval(offer.approvalId, offer.runId, offer.inputDigest, action.allow, `mobile:${signer.id}`, marker);
        return this.acknowledgment(receipt, applied ? "applied" : "rejected", applied ? "decision-recorded" : "approval-no-longer-live", now);
      }
      if (action.kind === "room-message" || action.kind === "room-pause") {
        if (!this.config().roomIds.includes(action.roomId)) return this.acknowledgment(receipt, "rejected", "room-outside-scope", now);
        try {
          if (action.kind === "room-message") this.rooms.send(action.roomId, receipt.requestId!, action.text);
          else this.rooms.pause(action.roomId, action.paused);
        } catch { return this.recoverReceipt(receipt, now); }
        return this.acknowledgment(receipt, "applied", action.kind === "room-message" ? "message-recorded" : "room-state-recorded", now);
      }
      if (action.kind === "run-stop") {
        if (!this.scopedRun(action.runId)) return this.acknowledgment(receipt, "rejected", "run-outside-scope", now);
        const status = fold(this.store.read(0)).runs[action.runId]?.status;
        if (!status || ["done", "failed", "cancelled", "reviewing", "merged"].includes(status)) return this.acknowledgment(receipt, "rejected", "run-already-finished", now);
        this.supervisor.cancel(action.runId, `Stopped by mobile:${signer.id}`);
        return this.recoverReceipt(receipt, now);
      }
      return this.acknowledgment(receipt, "applied", "snapshot-requested", now);
    } finally { this.processing.delete(marker); }
  }
}
