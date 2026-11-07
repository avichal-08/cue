import { ProviderError, type EmbedRole, type ImageEmbedder, type TextEmbedder } from './providers';

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
