export const nearDuplicate = 0.98;

export interface OcrCandidate {
  id: string;
  vector?: number[];
}

export type OcrStep = { id: string; read: true } | { id: string; read: false; copyFrom?: string };

const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i]!, 0);

export function planOcr(segments: OcrCandidate[], threshold = nearDuplicate): OcrStep[] {
  let anchor: { id: string; vector: number[] } | undefined;
  return segments.map(({ id, vector }) => {
    if (!vector) return { id, read: false };
    if (anchor && dot(anchor.vector, vector) >= threshold) {
      return { id, read: false, copyFrom: anchor.id };
    }
    anchor = { id, vector };
    return { id, read: true };
  });
}
