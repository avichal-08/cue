import { describe, expect, it } from 'vitest';
import { Limiter, parseRateLimits } from '../src/limits';
import { ProviderError } from '../src/providers';

function clock() {
  let t = 0;
  const waits: number[] = [];
  return {
    now: () => t,
    sleep: (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    },
    waits,
    advance: (ms: number) => (t += ms),
  };
}

describe('parseRateLimits', () => {
  it('reads provider/model=rpm pairs', () => {
    expect(parseRateLimits(' gemini/flash=15, groq/whisper=20 ')).toEqual({
      'gemini/flash': 15,
      'groq/whisper': 20,
    });
    expect(parseRateLimits(undefined)).toEqual({});
    expect(() => parseRateLimits('flash=15')).toThrow(/provider\/model=rpm/);
  });
});

describe('Limiter', () => {
  it('spaces calls to stay under the rpm', async () => {
    const c = clock();
    const limiter = new Limiter({ limits: { 'gemini/flash': 30 }, ...c });
    await Promise.all([1, 2, 3].map(() => limiter.acquire('gemini', 'flash')));
    expect(c.waits).toEqual([2_000, 4_000]);
    await limiter.acquire('gemini', 'other');
    expect(c.waits).toHaveLength(2);
  });

  it('cools every caller down after a 429', async () => {
    const c = clock();
    const limiter = new Limiter(c);
    limiter.penalize('gemini', 'flash', new ProviderError('gemini', 429, 'slow down', 7_000));
    await limiter.acquire('gemini', 'flash');
    expect(c.waits).toEqual([7_000]);
  });

  it('fails fast once the daily quota is used up, then tries again later', async () => {
    const c = clock();
    const limiter = new Limiter({ holdMs: 60_000, ...c });
    const daily = new ProviderError('gemini', 429, 'GenerateRequestsPerDayPerProjectPerModel');
    expect(daily.daily).toBe(true);
    expect(daily.retryable).toBe(false);
    limiter.penalize('gemini', 'flash', daily);
    const err = await limiter.acquire('gemini', 'flash').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 429, daily: true, retryable: false });
    c.advance(60_000);
    await expect(limiter.acquire('gemini', 'flash')).resolves.toBeUndefined();
  });

  it('refuses to wait longer than maxWaitMs', async () => {
    const c = clock();
    const limiter = new Limiter({ maxWaitMs: 2_000, ...c });
    limiter.penalize('gemini', 'flash', new ProviderError('gemini', 429, 'busy', 30_000));
    const err = await limiter.acquire('gemini', 'flash').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 429, retryable: true, retryAfterMs: 30_000 });
    expect(c.waits).toEqual([]);
  });

  it('ignores errors other than 429', () => {
    const c = clock();
    const limiter = new Limiter(c);
    limiter.penalize('gemini', 'flash', new ProviderError('gemini', 503, 'busy'));
    return limiter.acquire('gemini', 'flash').then(() => expect(c.waits).toEqual([]));
  });
});
