import { ProviderError } from './providers';

export type RateLimits = Record<string, number>;

export function parseRateLimits(spec: string | undefined): RateLimits {
  const limits: RateLimits = {};
  for (const entry of (spec ?? '').split(',')) {
    if (!entry.trim()) continue;
    const [key, value] = entry.split('=').map((s) => s.trim());
    const rpm = Number(value);
    if (!key?.includes('/') || !Number.isFinite(rpm) || rpm <= 0)
      throw new Error(`bad PROVIDER_RPM entry "${entry}", use provider/model=rpm`);
    limits[key] = rpm;
  }
  return limits;
}

interface Slot {
  next: number;
  coolUntil: number;
  heldUntil: number;
}

export interface LimiterOptions {
  limits?: RateLimits;
  maxWaitMs?: number;
  holdMs?: number;
  defaultCooldownMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<unknown>;
}

export class Limiter {
  private slots = new Map<string, Slot>();
  private limits: RateLimits;
  private maxWaitMs: number;
  private readonly holdMs: number;
  private readonly defaultCooldownMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<unknown>;

  constructor({
    limits = {},
    maxWaitMs = Infinity,
    holdMs = 15 * 60_000,
    defaultCooldownMs = 5_000,
    now = Date.now,
    sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  }: LimiterOptions = {}) {
    this.limits = limits;
    this.maxWaitMs = maxWaitMs;
    this.holdMs = holdMs;
    this.defaultCooldownMs = defaultCooldownMs;
    this.now = now;
    this.sleep = sleep;
  }

  configure({ limits, maxWaitMs }: { limits?: RateLimits; maxWaitMs?: number }) {
    if (limits) this.limits = limits;
    if (maxWaitMs !== undefined) this.maxWaitMs = maxWaitMs;
  }

  reset() {
    this.slots.clear();
  }

  private slot(key: string) {
    let slot = this.slots.get(key);
    if (!slot) {
      slot = { next: 0, coolUntil: 0, heldUntil: 0 };
      this.slots.set(key, slot);
    }
    return slot;
  }

  async acquire(provider: string, model: string) {
    const key = `${provider}/${model}`;
    const slot = this.slot(key);
    const now = this.now();
    if (slot.heldUntil > now) {
      const until = new Date(slot.heldUntil).toISOString();
      throw new ProviderError(
        provider,
        429,
        `quota per day used up for ${key}, paused until ${until}`,
      );
    }
    const at = Math.max(now, slot.next, slot.coolUntil);
    const wait = at - now;
    if (wait > this.maxWaitMs)
      throw new ProviderError(provider, 429, `${key} is rate limited, retry later`, wait);
    const rpm = this.limits[key];
    slot.next = at + (rpm ? 60_000 / rpm : 0);
    if (wait > 0) await this.sleep(wait);
  }

  penalize(provider: string, model: string, err: unknown) {
    if (!(err instanceof ProviderError) || err.status !== 429) return;
    const slot = this.slot(`${provider}/${model}`);
    const now = this.now();
    if (err.daily) slot.heldUntil = Math.max(slot.heldUntil, now + this.holdMs);
    else
      slot.coolUntil = Math.max(slot.coolUntil, now + (err.retryAfterMs ?? this.defaultCooldownMs));
  }
}

export const limiter = new Limiter();
