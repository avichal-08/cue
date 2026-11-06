export interface Span {
  startMs: number;
  endMs: number;
}

export interface Bounds {
  minMs: number;
  maxMs: number;
}

export const segmentBounds: Bounds = { minMs: 5_000, maxMs: 30_000 };

function scenesFrom(cuts: number[], durationMs: number): Span[] {
  const edges = [0, ...cuts.filter((c) => c > 0 && c < durationMs), durationMs];
  return edges.slice(1).map((endMs, i) => ({ startMs: edges[i]!, endMs }));
}

function mergeShort(scenes: Span[], minMs: number): Span[] {
  const out: Span[] = [];
  let current: Span | undefined;
  for (const scene of scenes) {
    current = current ? { startMs: current.startMs, endMs: scene.endMs } : scene;
    if (current.endMs - current.startMs >= minMs) {
      out.push(current);
      current = undefined;
    }
  }
  if (current) {
    const last = out.pop();
    out.push(last ? { startMs: last.startMs, endMs: current.endMs } : current);
  }
  return out;
}

function splitLong(span: Span, maxMs: number): Span[] {
  const length = span.endMs - span.startMs;
  const parts = Math.ceil(length / maxMs);
  return Array.from({ length: parts }, (_, i) => ({
    startMs: span.startMs + Math.round((i * length) / parts),
    endMs: span.startMs + Math.round(((i + 1) * length) / parts),
  }));
}

export function toSegments(
  cuts: number[],
  durationMs: number,
  { minMs, maxMs }: Bounds = segmentBounds,
): Span[] {
  if (durationMs <= 0) return [];
  if (maxMs < minMs * 2) throw new Error('maxMs must be at least twice minMs');
  const scenes = scenesFrom(
    [...new Set(cuts)].sort((a, b) => a - b),
    durationMs,
  );
  return mergeShort(scenes, minMs).flatMap((s) => splitLong(s, maxMs));
}
