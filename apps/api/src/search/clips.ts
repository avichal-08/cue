export const mergeGapMs = 1_000;
export const maxClipMs = 90_000;
export const mergeRatio = 0.9;

export interface ClipPart {
  segmentId: string;
  videoId: string;
  startMs: number;
  endMs: number;
  rank: number;
  relevance: number;
}

export interface Clip<T extends ClipPart> {
  videoId: string;
  startMs: number;
  endMs: number;
  rank: number;
  parts: T[];
}

export function mergeIntoClips<T extends ClipPart>(
  hits: T[],
  { gapMs = mergeGapMs, maxMs = maxClipMs, ratio = mergeRatio } = {},
): Clip<T>[] {
  const byRank = [...hits].sort((a, b) => a.rank - b.rank);
  const used = new Set<T>();
  const clips: Clip<T>[] = [];

  for (const seed of byRank) {
    if (used.has(seed)) continue;
    used.add(seed);
    const clip: Clip<T> = { ...seed, parts: [seed] };
    const floor = seed.relevance * ratio;

    for (;;) {
      const next = byRank.find(
        (h) =>
          !used.has(h) &&
          h.videoId === clip.videoId &&
          h.relevance >= floor &&
          h.startMs - clip.endMs <= gapMs &&
          clip.startMs - h.endMs <= gapMs &&
          Math.max(clip.endMs, h.endMs) - Math.min(clip.startMs, h.startMs) <= maxMs,
      );
      if (!next) break;
      used.add(next);
      clip.startMs = Math.min(clip.startMs, next.startMs);
      clip.endMs = Math.max(clip.endMs, next.endMs);
      clip.parts.push(next);
    }

    clips.push({
      videoId: clip.videoId,
      startMs: clip.startMs,
      endMs: clip.endMs,
      rank: seed.rank,
      parts: clip.parts,
    });
  }

  return clips;
}
