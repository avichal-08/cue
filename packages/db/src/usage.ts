import { onProviderCall, type CallContext, type ProviderCall } from '@cue/core';
import { db } from './client';
import { providerCalls } from './schema';

type Row = typeof providerCalls.$inferInsert;

const flushAt = 50;
const flushAfterMs = 2_000;

export function toRow(call: ProviderCall, ctx: CallContext | undefined, source: string): Row {
  return {
    source: ctx?.source ?? source,
    videoId: ctx?.videoId ?? null,
    stage: ctx?.stage ?? null,
    provider: call.provider,
    model: call.model,
    operation: call.operation,
    ok: call.ok,
    status: call.status ?? null,
    ms: call.ms,
    audioMs: call.audioMs ?? null,
    inputTokens: call.inputTokens ?? null,
    outputTokens: call.outputTokens ?? null,
    images: call.images ?? null,
    texts: call.texts ?? null,
    chars: call.chars ?? null,
  };
}

export function recordProviderCalls(source: string) {
  const queue: Row[] = [];
  let timer: NodeJS.Timeout | undefined;

  async function flush() {
    clearTimeout(timer);
    timer = undefined;
    const rows = queue.splice(0);
    if (!rows.length) return;
    try {
      await db.insert(providerCalls).values(rows);
    } catch (err) {
      console.warn(`[usage] dropped ${rows.length} provider calls: ${(err as Error).message}`);
    }
  }

  const stop = onProviderCall((call, ctx) => {
    queue.push(toRow(call, ctx, source));
    if (queue.length >= flushAt) void flush();
    else timer ??= setTimeout(() => void flush(), flushAfterMs).unref();
  });

  return {
    flush,
    stop: async () => {
      stop();
      await flush();
    },
  };
}
