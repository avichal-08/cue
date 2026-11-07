import {
  env,
  geminiAnswerer,
  geminiEmbedder,
  geminiReranker,
  type Answerer,
  type ImageEmbedder,
  type Reranker,
  type TextEmbedder,
} from '@cue/core';
import { HttpError } from './errors';

let cachedEmbedder: (TextEmbedder & ImageEmbedder) | undefined;
let cachedReranker: Reranker | undefined;
let cachedAnswerer: Answerer | undefined;

export function embedder(): TextEmbedder & ImageEmbedder {
  const { GEMINI_API_KEY, GEMINI_EMBED_MODEL } = env();
  if (!GEMINI_API_KEY)
    throw new HttpError(503, 'search is not configured: GEMINI_API_KEY is missing');
  cachedEmbedder ??= geminiEmbedder({ apiKey: GEMINI_API_KEY, model: GEMINI_EMBED_MODEL });
  return cachedEmbedder;
}

export function reranker(): Reranker {
  const { GEMINI_API_KEY, GEMINI_FLASH_MODEL } = env();
  if (!GEMINI_API_KEY)
    throw new HttpError(503, 'search is not configured: GEMINI_API_KEY is missing');
  cachedReranker ??= geminiReranker({ apiKey: GEMINI_API_KEY, model: GEMINI_FLASH_MODEL });
  return cachedReranker;
}

export function answerer(): Answerer {
  const { GEMINI_API_KEY, GEMINI_FLASH_MODEL } = env();
  if (!GEMINI_API_KEY)
    throw new HttpError(503, 'answers are not configured: GEMINI_API_KEY is missing');
  cachedAnswerer ??= geminiAnswerer({ apiKey: GEMINI_API_KEY, model: GEMINI_FLASH_MODEL });
  return cachedAnswerer;
}
