export const mergeGapMs = 1_000;
export const maxClipMs = 90_000;

export interface ClipPart {
  segmentId: string;
  videoId: string;
  startMs: number;
  endMs: number;
  rank: number;
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
  { gapMs = mergeGapMs, maxMs = maxClipMs } = {},
): Clip<T>[] {
  const byVideo = new Map<string, T[]>();
  for (const hit of hits) byVideo.set(hit.videoId, [...(byVideo.get(hit.videoId) ?? []), hit]);

  const clips: Clip<T>[] = [];
  for (const [videoId, list] of byVideo) {
    let current: Clip<T> | undefined;
    for (const hit of [...list].sort((a, b) => a.startMs - b.startMs)) {
      const fits =
        current &&
        hit.startMs - current.endMs <= gapMs &&
        Math.max(current.endMs, hit.endMs) - current.startMs <= maxMs;
      if (current && fits) {
        current.endMs = Math.max(current.endMs, hit.endMs);
        current.rank = Math.min(current.rank, hit.rank);
        current.parts.push(hit);
      } else {
        current = { videoId, startMs: hit.startMs, endMs: hit.endMs, rank: hit.rank, parts: [hit] };
        clips.push(current);
      }
    }
  }

  for (const clip of clips) clip.parts.sort((a, b) => a.rank - b.rank);
  return clips.sort((a, b) => a.rank - b.rank);
}
