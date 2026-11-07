export const modalities = ['transcript', 'ocr', 'visual', 'keyword'] as const;
export type Modality = (typeof modalities)[number];

export const defaultWeights: Record<Modality, number> = {
  transcript: 1,
  ocr: 0.8,
  visual: 0.6,
  keyword: 1,
};

export const rrfK = 60;

export const minSimilarity: Partial<Record<Modality, number>> = {
  transcript: 0.65,
  ocr: 0.65,
  visual: 0.65,
};

export function aboveFloor(
  lists: Partial<Record<Modality, Ranked[]>>,
  floors: Partial<Record<Modality, number>> = minSimilarity,
): Partial<Record<Modality, Ranked[]>> {
  const kept: Partial<Record<Modality, Ranked[]>> = {};
  for (const modality of modalities) {
    const list = lists[modality];
    if (!list) continue;
    const floor = floors[modality];
    kept[modality] = floor === undefined ? list : list.filter((h) => h.score >= floor);
  }
  return kept;
}

export interface Ranked {
  segmentId: string;
  score: number;
}

export interface Match {
  rank: number;
  score: number;
}

export interface Fused {
  segmentId: string;
  score: number;
  matches: Partial<Record<Modality, Match>>;
}

export function fuse(
  lists: Partial<Record<Modality, Ranked[]>>,
  weights: Record<Modality, number> = defaultWeights,
  k = rrfK,
): Fused[] {
  const fused = new Map<string, Fused>();
  for (const modality of modalities) {
    const seen = new Set<string>();
    let rank = 0;
    for (const hit of lists[modality] ?? []) {
      if (seen.has(hit.segmentId)) continue;
      seen.add(hit.segmentId);
      rank++;
      const entry = fused.get(hit.segmentId) ?? { segmentId: hit.segmentId, score: 0, matches: {} };
      entry.score += weights[modality] / (k + rank);
      entry.matches[modality] = { rank, score: hit.score };
      fused.set(hit.segmentId, entry);
    }
  }
  return [...fused.values()].sort(
    (a, b) => b.score - a.score || a.segmentId.localeCompare(b.segmentId),
  );
}
