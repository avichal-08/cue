import { AsyncLocalStorage } from 'node:async_hooks';
import { limiter } from './limits';
import { ProviderError } from './providers';

export type Operation = 'transcribe' | 'embed-text' | 'embed-image' | 'ocr' | 'rerank' | 'answer';

export interface Usage {
  audioMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  images?: number;
  texts?: number;
  chars?: number;
}

export interface ProviderCall extends Usage {
  provider: string;
  model: string;
  operation: Operation;
  ms: number;
  ok: boolean;
  status?: number;
}

export interface CallContext {
  source: string;
  videoId?: string;
  stage?: string;
}

type Listener = (call: ProviderCall, context: CallContext | undefined) => void;

const listeners = new Set<Listener>();
const context = new AsyncLocalStorage<CallContext>();

export function onProviderCall(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function withCallContext<T>(ctx: CallContext, fn: () => Promise<T>): Promise<T> {
  return context.run(ctx, fn);
}

function emit(call: ProviderCall) {
  const ctx = context.getStore();
  for (const listener of listeners) {
    try {
      listener(call, ctx);
    } catch (err) {
      console.warn(`[usage] listener failed: ${(err as Error).message}`);
    }
  }
}

export async function metered<T>(
  call: { provider: string; model: string; operation: Operation; request?: Usage },
  run: () => Promise<{ value: T; usage?: Usage }>,
): Promise<T> {
  const { request, ...meta } = call;
  await limiter.acquire(meta.provider, meta.model);
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  try {
    const { value, usage } = await run();
    emit({ ...meta, ...request, ...usage, ms: ms(), ok: true });
    return value;
  } catch (err) {
    limiter.penalize(meta.provider, meta.model, err);
    const status = err instanceof ProviderError ? err.status : undefined;
    emit({ ...meta, ...request, ms: ms(), ok: false, ...(status ? { status } : {}) });
    throw err;
  }
}

export function geminiUsage(body: unknown): Usage {
  const meta = (
    body as {
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
      };
    }
  ).usageMetadata;
  if (!meta) return {};
  return {
    inputTokens: meta.promptTokenCount ?? 0,
    outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0),
  };
}
