import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { ProviderError } from '@cue/core';
import { withRetry } from '../src/retry';

function flaky(errors: Error[], value = 'ok') {
  let calls = 0;
  const fn = () => {
    const err = errors[calls++];
    return err ? Promise.reject(err) : Promise.resolve(value);
  };
  return { fn, calls: () => calls };
}

const recorder = () => {
  const waits: number[] = [];
  return { waits, sleep: (ms: number) => Promise.resolve(waits.push(ms)) };
};

describe('withRetry', () => {
  it('waits as the provider asks, then succeeds', async () => {
    const { fn, calls } = flaky([new ProviderError('gemini', 429, 'slow down', 7_000)]);
    const { waits, sleep } = recorder();
    await expect(withRetry(fn, { sleep })).resolves.toBe('ok');
    expect(calls()).toBe(2);
    expect(waits).toEqual([7_000]);
  });

  it('backs off exponentially without a retry hint and caps the wait', async () => {
    const err = new ProviderError('gemini', 503, 'busy');
    const { fn } = flaky([err, err, err]);
    const { waits, sleep } = recorder();
    await withRetry(fn, { attempts: 4, baseMs: 2_000, maxWaitMs: 5_000, sleep });
    expect(waits).toEqual([2_000, 4_000, 5_000]);
  });

  it('gives up after the last attempt with the retryable error', async () => {
    const err = new ProviderError('gemini', 429, 'quota');
    const { fn, calls } = flaky([err, err, err]);
    const { sleep } = recorder();
    await expect(withRetry(fn, { attempts: 3, sleep })).rejects.toBe(err);
    expect(calls()).toBe(3);
  });

  it('fails at once on errors that will not go away', async () => {
    const { fn, calls } = flaky([new ProviderError('gemini', 400, 'bad image')]);
    const { sleep } = recorder();
    await expect(withRetry(fn, { sleep })).rejects.toBeInstanceOf(UnrecoverableError);
    expect(calls()).toBe(1);
  });

  it('does not retry unknown errors', async () => {
    const boom = new Error('network down');
    const { fn, calls } = flaky([boom]);
    await expect(withRetry(fn, recorder())).rejects.toBe(boom);
    expect(calls()).toBe(1);
  });
});
