import { getObject } from '@cue/core';
import type { Fused } from './fuse';
import { rerank, type ImageLoader, type RerankOutcome } from './rerank';

export const keyframeImages: ImageLoader = async (rows) => {
  const images = new Map<string, Buffer>();
  await Promise.all(
    rows.map(async (row) => {
      if (!row.keyframeKey) return;
      try {
        images.set(row.segmentId, await getObject(row.keyframeKey));
      } catch (err) {
        console.warn(`[search] keyframe ${row.keyframeKey} unavailable: ${(err as Error).message}`);
      }
    }),
  );
  return images;
};

export function rerankWithKeyframes(
  query: string,
  hits: Fused[],
  options: { top?: number } = {},
): Promise<RerankOutcome> {
  return rerank(query, hits, { ...options, images: keyframeImages });
}
