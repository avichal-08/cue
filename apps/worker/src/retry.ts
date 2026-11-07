import { setTimeout as delay } from 'node:timers/promises';
import { ProviderError } from '@cue/core';
import { asJobError } from './models';

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  maxWaitMs?: number;
  sleep?: (ms: number) => Promise<unknown>;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 4, baseMs = 2_000, maxWaitMs = 60_000, sleep = delay }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof ProviderError && err.retryable;
      if (!retryable || attempt >= attempts) throw asJobError(err);
      await sleep(Math.min(err.retryAfterMs ?? baseMs * 2 ** (attempt - 1), maxWaitMs));
    }
  }
}
