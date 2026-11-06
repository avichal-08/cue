import type { Span } from './bounds';

export interface FrameRef {
  id: string;
  tsMs: number;
  storageKey: string;
}

export function pickKeyframe(span: Span, frames: FrameRef[]): FrameRef | undefined {
  const mid = (span.startMs + span.endMs) / 2;
  const inside = frames.filter((f) => f.tsMs >= span.startMs && f.tsMs < span.endMs);
  const pool = inside.length ? inside : frames;
  let best: FrameRef | undefined;
  for (const f of pool) {
    if (!best || Math.abs(f.tsMs - mid) < Math.abs(best.tsMs - mid)) best = f;
  }
  return best;
}
