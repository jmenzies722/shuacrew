/**
 * Ventures: each startup you're working on, from idea to revenue. A venture ties together its
 * stage, the crew's sessions and playbooks for it, what they saved, and what it earns.
 *
 * Revenue comes from Stripe with a key you give per venture. Only restricted (read-only) live keys
 * or test keys are accepted; the key lives in a 0600 file under the data home, never in the log,
 * and is only ever sent to api.stripe.com. ShuaCrew reads — it never charges, refunds or changes.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { apply, emptyState, type AnyEvent, type CrewState, type VentureStage, type VentureView } from "@shuacrew/core";
import type { EventStore } from "./store.js";

export const STAGES: VentureStage[] = ["idea", "validating", "building", "launching", "earning"];

/** What to run next at each stage — the playbook that moves a venture forward. */
export const NEXT: Record<VentureStage, { playbook: string; why: string } | undefined> = {
  idea: { playbook: "validate-idea", why: "Find out if people want it and will pay before you build." },
  validating: { playbook: "landing-page", why: "Put the promise in front of real people and collect sign-ups." },
  building: { playbook: "mvp", why: "Build the smallest version that delivers the promise." },
  launching: { playbook: "launch", why: "Get it in front of the first 100 customers and take payment." },
  earning: { playbook: "growth-review", why: "Read the numbers weekly and run the next experiments." },
  paused: undefined,
  stopped: undefined,
};

type Fetch = typeof fetch;
const RELEVANT = /^(venture\.|run\.created$|play\.started$)/;
const SIX_HOURS = 6 * 60 * 60 * 1000;

export class Ventures {
  private state: CrewState = emptyState();
  private unsubscribe: () => void;
  private timer?: NodeJS.Timeout;

  constructor(
    private store: EventStore,
    private keysFile: string,
    private http: Fetch = fetch,
  ) {
    for (const e of store.read(0)) this.take(e);
    this.unsubscribe = store.subscribe((e) => this.take(e));
  }

  private take(e: AnyEvent) {
    if (RELEVANT.test(e.kind)) apply(this.state, e);
  }

  /** Keep revenue fresh: every six hours for connected ventures. */
  schedule() {
    this.timer = setInterval(() => void this.syncAll(), SIX_HOURS);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.unsubscribe();
  }

  list(): VentureView[] {
    return Object.values(this.state.ventures).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): VentureView | undefined {
    return this.state.ventures[id];
  }

  set(input: Partial<Omit<VentureView, "stage" | "stages" | "history" | "metrics" | "stripe">> & { name: string }): VentureView {
    const name = input.name?.trim();
    if (!name) throw new Error("give the venture a name");
    const id = input.id || slug(name);
    const clean = (v?: string) => v?.trim() || undefined;
    const goalMrr = input.goalMrr ?? parseMoney(input.goal);
    this.store.append("venture.set", {
      id,
      name,
      emoji: input.emoji?.trim() || "🌱",
      color: input.color || "#7bd88f",
      pitch: input.pitch?.trim() ?? "",
      customer: clean(input.customer),
      goal: clean(input.goal),
      goalMrr: goalMrr && goalMrr > 0 ? goalMrr : undefined,
      repo: clean(input.repo),
      website: clean(input.website),
    });
    return this.get(id)!;
  }

  stage(id: string, stage: VentureStage, note?: string) {
    const v = this.need(id);
    if (v.stage === stage) return;
    this.store.append("venture.stage", { id, stage, note: note?.trim() || undefined });
  }

  remove(id: string) {
    this.need(id);
    this.forget(id);
    this.store.append("venture.removed", { id });
  }

  /** Numbers you type in yourself (no Stripe yet, or revenue from somewhere else). */
  record(id: string, input: { mrr?: number; revenue30d?: number; customers?: number; currency?: string }) {
    this.need(id);
    const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined);
    const reading = { mrr: num(input.mrr), revenue30d: num(input.revenue30d), customers: num(input.customers) === undefined ? undefined : Math.round(input.customers!) };
    if (Object.values(reading).every((v) => v === undefined)) throw new Error("enter at least one number");
    this.store.append("venture.metrics", { id, source: "manual", currency: (input.currency || this.get(id)?.metrics?.currency || "usd").toLowerCase(), ...reading });
  }

  /** A venture's one-paragraph brief, for every crew session working on it. */
  brief(id: string): string | undefined {
    const v = this.get(id);
    if (!v) return undefined;
    const m = v.metrics;
    const money = (n?: number) => (n === undefined ? undefined : `${formatMoney(n, m?.currency ?? "usd")}`);
    return [
      `This work is for the venture "${v.name}" (stage: ${v.stage}).`,
      v.pitch && `What it is: ${v.pitch}`,
      v.customer && `For: ${v.customer}`,
      v.goal && `Goal: ${v.goal}`,
      m && `Latest numbers (${m.source}): ${[m.mrr !== undefined && `MRR ${money(m.mrr)}`, m.revenue30d !== undefined && `revenue last 30 days ${money(m.revenue30d)}`, m.customers !== undefined && `${m.customers} paying customers`].filter(Boolean).join(", ")}.`,
      v.website && `Website: ${v.website}`,
      "Search the library for this venture's earlier research, specs and decisions before starting, and save deliverables with save_artifact.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  // ── Stripe ──────────────────────────────────────────────────────────────────

  /** Check the key works and is read-only enough, store it (0600), then take a first reading. */
  async connect(id: string, key: string) {
    this.need(id);
    key = key.trim();
    if (/^sk_live_/.test(key)) throw new Error("that's a full-access secret key — create a restricted key with read-only access instead (Stripe → Developers → API keys → Create restricted key)");
    if (!/^(rk_live_|rk_test_|sk_test_)[A-Za-z0-9]+$/.test(key)) throw new Error("that doesn't look like a Stripe restricted key (rk_live_…) or test key (sk_test_…)");
    const account = await this.stripe<{ id: string; settings?: { dashboard?: { display_name?: string } }; business_profile?: { name?: string } }>(key, "/v1/account").catch(async (error: Error) => {
      // Restricted keys often can't read the account itself; a balance read proves the key instead.
      if (!/permission|restricted|scope/i.test(error.message)) throw error;
      await this.stripe(key, "/v1/balance");
      return undefined;
    });
    const keys = this.keys();
    keys[id] = key;
    this.writeKeys(keys);
    this.store.append("venture.stripe", { id, connected: true, account: account?.settings?.dashboard?.display_name ?? account?.business_profile?.name ?? account?.id, mode: key.includes("_test_") ? "test" : "live" });
    await this.sync(id);
  }

  disconnect(id: string) {
    this.need(id);
    this.forget(id);
    this.store.append("venture.stripe", { id, connected: false });
  }

  async syncAll() {
    for (const v of this.list()) if (v.stripe?.connected) await this.sync(v.id).catch(() => undefined);
  }

  /** Read MRR, the last 30 days' revenue and paying customers from Stripe. */
  async sync(id: string) {
    const key = this.keys()[id];
    if (!key) throw new Error("connect Stripe first");
    try {
      const subs = await this.all<StripeSub>(key, "/v1/subscriptions?status=active&limit=100&expand[]=data.items.data.price");
      const since = Math.floor(Date.now() / 1000) - 30 * 86400;
      const charges = await this.all<StripeCharge>(key, `/v1/charges?limit=100&created[gte]=${since}`);
      const reading = summarise(subs, charges);
      this.store.append("venture.metrics", { id, source: "stripe", ...reading });
    } catch (error) {
      this.store.append("venture.metrics", { id, source: "stripe", currency: this.get(id)?.metrics?.currency ?? "usd", error: (error as Error).message.slice(0, 300) });
      throw error;
    }
  }

  private async all<T extends { id: string }>(key: string, path: string, cap = 2000): Promise<T[]> {
    const out: T[] = [];
    let after: string | undefined;
    for (;;) {
      const page = await this.stripe<{ data: T[]; has_more: boolean }>(key, `${path}${after ? `&starting_after=${after}` : ""}`);
      out.push(...page.data);
      if (!page.has_more || !page.data.length || out.length >= cap) return out;
      after = page.data[page.data.length - 1]!.id;
    }
  }

  private async stripe<T>(key: string, path: string): Promise<T> {
    const response = await this.http(`https://api.stripe.com${path}`, { headers: { Authorization: `Bearer ${key}`, "Stripe-Version": "2024-06-20" }, signal: AbortSignal.timeout(20_000) });
    const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!response.ok) throw new Error(`Stripe: ${body.error?.message ?? `HTTP ${response.status}`}`);
    return body;
  }

  private need(id: string): VentureView {
    const v = this.get(id);
    if (!v) throw new Error(`no venture ${id}`);
    return v;
  }

  private keys(): Record<string, string> {
    if (!existsSync(this.keysFile)) return {};
    try {
      return JSON.parse(readFileSync(this.keysFile, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private writeKeys(keys: Record<string, string>) {
    writeFileSync(this.keysFile, JSON.stringify(keys), { mode: 0o600 });
    chmodSync(this.keysFile, 0o600);
  }

  private forget(id: string) {
    const keys = this.keys();
    if (keys[id]) {
      delete keys[id];
      this.writeKeys(keys);
    }
  }
}

interface StripeSub {
  id: string;
  customer: string;
  currency: string;
  items: { data: Array<{ quantity?: number; price: { unit_amount: number | null; currency: string; recurring: { interval: "day" | "week" | "month" | "year"; interval_count: number } | null } }> };
}
interface StripeCharge {
  id: string;
  paid: boolean;
  status: string;
  amount_captured: number;
  amount_refunded: number;
  currency: string;
  customer: string | null;
}

const PER_MONTH = { day: 365 / 12, week: 52 / 12, month: 1, year: 1 / 12 } as const;
/** Currencies Stripe counts in whole units (no cents). */
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);

export function summarise(subs: StripeSub[], charges: StripeCharge[]) {
  const currency = subs[0]?.currency ?? charges[0]?.currency ?? "usd";
  const unit = ZERO_DECIMAL.has(currency) ? 1 : 100;
  let mrr = 0;
  for (const sub of subs) {
    if (sub.currency !== currency) continue; // one currency per venture; others would need FX
    for (const item of sub.items.data) {
      const r = item.price.recurring;
      if (!r || item.price.unit_amount === null) continue;
      mrr += (item.price.unit_amount * (item.quantity ?? 1) * PER_MONTH[r.interval]) / Math.max(r.interval_count, 1);
    }
  }
  const paid = charges.filter((c) => c.paid && c.status === "succeeded" && c.currency === currency);
  const revenue = paid.reduce((sum, c) => sum + c.amount_captured - c.amount_refunded, 0);
  const customers = new Set((subs.length ? subs.map((s) => s.customer) : paid.map((c) => c.customer)).filter(Boolean)).size;
  return { currency, mrr: Math.round(mrr) / unit, revenue30d: revenue / unit, customers, subscriptions: subs.length };
}

export function parseMoney(text?: string): number | undefined {
  if (!/[$€£]|mrr|\/\s*mo|a month|per month|revenue/i.test(text ?? "")) return undefined; // "50 customers" isn't money
  const m = /\$?\s*(\d+(?:[.,]\d+)?)\s*([km])?/i.exec(text ?? "");
  if (!m) return undefined;
  const n = Number(m[1]!.replace(",", "."));
  return m[2]?.toLowerCase() === "k" ? n * 1000 : m[2]?.toLowerCase() === "m" ? n * 1_000_000 : n;
}

export function formatMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: Number.isInteger(n) || n >= 1000 ? 0 : 2, maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `venture-${Date.now().toString(36)}`;
}
