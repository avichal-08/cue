import type { Word } from '@cue/core';
import type { Span } from './bounds';

export interface SegmentRef extends Span {
  id: string;
}

export interface PlacedWord extends Word {
  segmentId: string | null;
}

export function placeWords(segments: SegmentRef[], words: Word[]): PlacedWord[] {
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
  let s = 0;
  return [...words]
    .sort((a, b) => a.startMs - b.startMs)
    .map((w) => {
      while (s < sorted.length && w.startMs >= sorted[s]!.endMs) s++;
      const seg = sorted[s];
      const inside = seg && w.startMs >= seg.startMs;
      return { ...w, segmentId: inside ? seg.id : null };
    });
}

export function segmentTexts(
  segments: SegmentRef[],
  words: PlacedWord[],
): Map<string, string | null> {
  const texts = new Map<string, string[]>(segments.map((s) => [s.id, []]));
  for (const w of words) if (w.segmentId) texts.get(w.segmentId)?.push(w.word);
  return new Map([...texts].map(([id, list]) => [id, list.length ? list.join(' ') : null]));
}
