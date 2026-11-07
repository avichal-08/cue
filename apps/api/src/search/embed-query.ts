import { createHash } from 'node:crypto';
import { ProviderError } from '@cue/core';
import { cacheEmbeddings, cachedEmbeddings } from '@cue/db';
import { HttpError } from '../errors';
import { embedder } from '../models';

export interface QueryVector {
  vector: number[];
  model: string;
  cached: boolean;
  ms: number;
}

export const queryHash = (text: string) =>
  createHash('sha256')
    .update(`query\n${text.replace(/\s+/g, ' ').trim().toLowerCase()}`)
    .digest('hex');

export async function embedQuery(text: string): Promise<QueryVector> {
  const started = performance.now();
  const model = embedder();
  const hash = queryHash(text);
  const hit = (await cachedEmbeddings(model.id, 'text', [hash])).get(hash);
  if (hit) return { vector: hit, model: model.id, cached: true, ms: performance.now() - started };

  try {
    const [vector] = await model.embed([text], 'query');
    await cacheEmbeddings(model.id, 'text', [{ hash, embedding: vector! }]);
    return { vector: vector!, model: model.id, cached: false, ms: performance.now() - started };
  } catch (err) {
    if (err instanceof ProviderError && err.status === 429)
      throw new HttpError(429, 'search is busy, try again shortly');
    if (err instanceof ProviderError) throw new HttpError(502, 'query embedding failed');
    throw err;
  }
}
