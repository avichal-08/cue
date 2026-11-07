import {
  ProviderError,
  type EmbedRole,
  type ImageEmbedder,
  type Ocr,
  type RerankCandidate,
  type Reranker,
  type RerankResult,
  type TextEmbedder,
} from './providers';

const base = 'https://generativelanguage.googleapis.com/v1beta';
const maxImagesPerCall = 6;
const maxTextsPerCall = 100;

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export function formatText(text: string, role: EmbedRole) {
  return role === 'query' ? `task: search result | query: ${text}` : `title: none | text: ${text}`;
}

export function imageMime(image: Buffer): string {
  if (image[0] === 0xff && image[1] === 0xd8) return 'image/jpeg';
  if (image.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  throw new Error('only jpeg and png images can be embedded');
}

function retryAfterMs(body: string, res: Response) {
  const header = Number(res.headers.get('retry-after'));
  if (header > 0) return header * 1000;
  const delay = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(body)?.[1];
  return delay ? Math.ceil(Number(delay) * 1000) : undefined;
}

function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  dims?: number;
  fetch?: typeof fetch;
}

export function geminiEmbedder({
  apiKey,
  model = 'gemini-embedding-2',
  dims = 1536,
  fetch: fetchImpl = fetch,
}: GeminiOptions): TextEmbedder & ImageEmbedder {
  async function call(parts: Part[]): Promise<number[][]> {
    const res = await fetchImpl(`${base}/models/${model}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        requests: parts.map((part) => ({
          model: `models/${model}`,
          content: { parts: [part] },
          outputDimensionality: dims,
        })),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ProviderError('gemini', res.status, body, retryAfterMs(body, res));
    }
    const { embeddings } = (await res.json()) as { embeddings?: { values: number[] }[] };
    if (embeddings?.length !== parts.length || embeddings.some((e) => e.values.length !== dims))
      throw new ProviderError('gemini', 502, `expected ${parts.length} vectors of ${dims} dims`);
    return embeddings.map((e) => e.values);
  }

  async function embedParts(parts: Part[], size: number) {
    const out: number[][] = [];
    for (const batch of batches(parts, size)) out.push(...(await call(batch)));
    return out;
  }

  const embed = (texts: string[], role: EmbedRole) =>
    embedParts(
      texts.map((t) => ({ text: formatText(t, role) })),
      maxTextsPerCall,
    );

  return {
    id: `gemini/${model}@${dims}`,
    dims,
    embed,
    embedText: (texts) => embed(texts, 'query'),
    embedImages: (images) =>
      embedParts(
        images.map((img) => ({
          inlineData: { mimeType: imageMime(img), data: img.toString('base64') },
        })),
        maxImagesPerCall,
      ),
  };
}

export const ocrPrompt =
  'Transcribe all legible text visible in this video frame: slides, code, captions, labels and UI. ' +
  'Return one string per block of text in reading order, keeping line breaks and code indentation. ' +
  'Do not describe the image. Return an empty list if there is no text.';

export function parseOcrReply(body: unknown): string[] {
  const parts = (body as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    .candidates?.[0]?.content?.parts;
  const raw = parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!raw.trim()) return [];
  const blocks = JSON.parse(raw) as unknown;
  if (!Array.isArray(blocks)) throw new ProviderError('gemini', 502, 'ocr reply is not a list');
  return blocks
    .filter((b): b is string => typeof b === 'string')
    .map((b) => b.trim())
    .filter(Boolean);
}

export interface GeminiOcrOptions {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
}

export function geminiOcr({
  apiKey,
  model = 'gemini-3.5-flash-lite',
  fetch: fetchImpl = fetch,
}: GeminiOcrOptions): Ocr {
  return {
    id: `gemini/${model}`,
    async read(image) {
      const res = await fetchImpl(`${base}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inlineData: { mimeType: imageMime(image), data: image.toString('base64') } },
                { text: ocrPrompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new ProviderError('gemini', res.status, body, retryAfterMs(body, res));
      }
      try {
        return parseOcrReply(await res.json()).map((text) => ({ text }));
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        throw new ProviderError('gemini', 502, `bad ocr reply: ${(err as Error).message}`);
      }
    },
  };
}

const maxCandidateChars = 800;

export function rerankPrompt(query: string, count: number, withImages: boolean) {
  return [
    `You rank video segments for the search query: "${query}".`,
    `There are ${count} candidates, c1 to c${count}. Each has its spoken transcript and on-screen text` +
      (withImages ? ', followed by its keyframe image.' : '.'),
    'For every candidate return its id, a reason of at most 12 words saying what in it does or does not answer the query, ' +
      'and a score from 0 (unrelated) to 10 (directly answers the query). Judge only what the candidate contains.',
  ].join('\n');
}

export function candidateText(c: RerankCandidate, label: string) {
  const text =
    c.text.length > maxCandidateChars ? `${c.text.slice(0, maxCandidateChars)}…` : c.text;
  return `[${label}]\n${text || '(no text)'}`;
}

export function parseRerankReply(
  body: unknown,
  candidates: RerankCandidate[],
  topK: number,
): RerankResult[] {
  const parts = (body as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
    .candidates?.[0]?.content?.parts;
  const raw = parts?.map((p) => p.text ?? '').join('') ?? '';
  const items = JSON.parse(raw || '[]') as unknown;
  if (!Array.isArray(items)) throw new ProviderError('gemini', 502, 'rerank reply is not a list');

  const results = new Map<string, RerankResult>();
  for (const item of items as { id?: unknown; score?: unknown; reason?: unknown }[]) {
    const index =
      typeof item.id === 'string' ? Number(/^c(\d+)$/.exec(item.id.trim())?.[1]) - 1 : -1;
    const candidate = candidates[index];
    const score = Number(item.score);
    if (!candidate || !Number.isFinite(score) || results.has(candidate.id)) continue;
    results.set(candidate.id, {
      id: candidate.id,
      score: Math.min(Math.max(score, 0), 10) / 10,
      reason: typeof item.reason === 'string' ? item.reason.trim() : undefined,
    });
  }
  return [...results.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

export interface GeminiRerankerOptions {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
}

export function geminiReranker({
  apiKey,
  model = 'gemini-3.5-flash-lite',
  fetch: fetchImpl = fetch,
}: GeminiRerankerOptions): Reranker {
  return {
    id: `gemini/${model}`,
    async rerank(query, candidates, topK) {
      if (!candidates.length) return [];
      const withImages = candidates.some((c) => c.image);
      const parts: Part[] = [{ text: rerankPrompt(query, candidates.length, withImages) }];
      candidates.forEach((c, i) => {
        parts.push({ text: candidateText(c, `c${i + 1}`) });
        if (c.image)
          parts.push({
            inlineData: { mimeType: imageMime(c.image), data: c.image.toString('base64') },
          });
      });

      const res = await fetchImpl(`${base}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'STRING' },
                  reason: { type: 'STRING' },
                  score: { type: 'NUMBER' },
                },
                required: ['id', 'reason', 'score'],
                propertyOrdering: ['id', 'reason', 'score'],
              },
            },
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new ProviderError('gemini', res.status, body, retryAfterMs(body, res));
      }
      try {
        return parseRerankReply(await res.json(), candidates, topK);
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        throw new ProviderError('gemini', 502, `bad rerank reply: ${(err as Error).message}`);
      }
    },
  };
}
