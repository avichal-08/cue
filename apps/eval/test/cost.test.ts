import { describe, expect, it } from 'vitest';
import { summarizeIngest, videoCost, type IngestVideo } from '../src/ingest';
import { priceAll, priceUsage, type Prices, type UsageRow } from '../src/pricing';

const prices: Prices = {
  currency: 'USD',
  checked: '2026-11-13',
  charsPerToken: 4,
  models: {
    'groq/whisper': { audioHour: 0.04, minBilledSec: 10 },
    'gemini/embed': { inputTokensM: 0.2, image: 0.00012 },
    'gemini/flash': { inputTokensM: 0.3, outputTokensM: 2.5 },
  },
};

const usage = (over: Partial<UsageRow>): UsageRow => ({
  provider: 'gemini',
  model: 'flash',
  operation: 'ocr',
  calls: 1,
  failed: 0,
  ms: 100,
  audioMs: 0,
  inputTokens: 0,
  outputTokens: 0,
  images: 0,
  texts: 0,
  chars: 0,
  ...over,
});

describe('priceUsage', () => {
  it('prices audio by the hour with a per-call minimum', () => {
    const long = priceUsage(
      usage({ provider: 'groq', model: 'whisper', audioMs: 3_600_000 }),
      prices,
    );
    expect(long.cost).toBeCloseTo(0.04);
    const short = priceUsage(
      usage({ provider: 'groq', model: 'whisper', calls: 3, audioMs: 3_000 }),
      prices,
    );
    expect(short.cost).toBeCloseTo((30 / 3600) * 0.04);
  });

  it('prices tokens in and out', () => {
    const p = priceUsage(usage({ inputTokens: 1_000_000, outputTokens: 100_000 }), prices);
    expect(p.cost).toBeCloseTo(0.3 + 0.25);
    expect(p.estimated).toBe(false);
  });

  it('estimates embedding tokens from characters and prices images', () => {
    const text = priceUsage(usage({ model: 'embed', chars: 4_000_000 }), prices);
    expect(text.cost).toBeCloseTo(0.2);
    expect(text.estimated).toBe(true);
    const images = priceUsage(usage({ model: 'embed', images: 1000 }), prices);
    expect(images.cost).toBeCloseTo(0.12);
  });

  it('flags models without a price', () => {
    const all = priceAll([usage({ model: 'mystery', inputTokens: 5 })], prices);
    expect(all.cost).toBe(0);
    expect(all.unpriced).toEqual(['gemini/mystery']);
  });
});

const t = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();

const video = (id: string, durationMs: number, tracked: boolean): IngestVideo => ({
  id,
  title: id,
  status: 'ready',
  durationMs,
  stages: ['decode', 'segment', 'transcribe', 'see', 'index'].map((stage, i) => ({
    stage,
    status: 'done',
    attempts: 1,
    startedAt: t(i * 10),
    finishedAt: t(i * 10 + 6),
  })),
  usage: tracked ? [usage({ inputTokens: 1_000_000 })] : [],
});

describe('ingest summary', () => {
  it('times a video from first start to last finish', () => {
    const c = videoCost(video('a', 600_000, true), prices)!;
    expect(c.wallMs).toBe(46_000);
    expect(c.stageMs.see).toBe(6_000);
    expect(c.cost).toBeCloseTo(0.3);
    expect(c.byOperation).toEqual({ ocr: c.cost });
  });

  it('skips videos that are not ready', () => {
    expect(videoCost({ ...video('a', 1000, true), status: 'failed' }, prices)).toBeNull();
  });

  it('normalises to an hour of video and only costs tracked videos', () => {
    const costs = [video('a', 1_800_000, true), video('b', 1_800_000, false)].map((v) =>
      videoCost(v, prices)!,
    );
    const s = summarizeIngest(costs);
    expect(s.videoHours).toBeCloseTo(1);
    expect(s.timed.minutesPerHour).toBeCloseTo((2 * 46) / 60);
    expect(s.costed?.videos).toBe(1);
    expect(s.costed?.perHour).toBeCloseTo(0.6);
  });
});
