import { afterEach, describe, expect, it } from 'vitest';
import { limiter } from '../src/limits';
import { formatText, geminiEmbedder, imageMime } from '../src/gemini';
import { ProviderError } from '../src/providers';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const png = Buffer.from('89504e470d0a1a0a00', 'hex');

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: {
    requests: { model: string; content: { parts: unknown[] }; outputDimensionality: number }[];
  };
}

function fakeGemini(dims = 4, fail?: Response) {
  const sent: Sent[] = [];
  const impl: typeof fetch = (url, init) => {
    const body = JSON.parse(init!.body as string) as Sent['body'];
    sent.push({ url: url as string, headers: init!.headers as Record<string, string>, body });
    if (fail) return Promise.resolve(fail);
    const embeddings = body.requests.map((_, i) => ({
      values: Array.from({ length: dims }, () => sent.length * 100 + i),
    }));
    return Promise.resolve(Response.json({ embeddings }));
  };
  return { sent, impl };
}

afterEach(() => limiter.reset());

describe('formatText', () => {
  it('uses the search prefixes gemini-embedding-2 expects', () => {
    expect(formatText('cats', 'query')).toBe('task: search result | query: cats');
    expect(formatText('cats', 'document')).toBe('title: none | text: cats');
  });
});

describe('imageMime', () => {
  it('detects jpeg and png and rejects anything else', () => {
    expect(imageMime(jpeg)).toBe('image/jpeg');
    expect(imageMime(png)).toBe('image/png');
    expect(() => imageMime(Buffer.from('GIF89a'))).toThrow();
  });
});

describe('geminiEmbedder', () => {
  it('sends one request per text with the role prefix and dims', async () => {
    const { sent, impl } = fakeGemini();
    const e = geminiEmbedder({ apiKey: 'k', dims: 4, fetch: impl });

    const vectors = await e.embed(['a', 'b'], 'document');

    expect(e.id).toBe('gemini/gemini-embedding-2@4');
    expect(vectors).toEqual([
      [100, 100, 100, 100],
      [101, 101, 101, 101],
    ]);
    expect(sent[0]!.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents',
    );
    expect(sent[0]!.headers['x-goog-api-key']).toBe('k');
    expect(sent[0]!.body.requests[0]).toEqual({
      model: 'models/gemini-embedding-2',
      content: { parts: [{ text: 'title: none | text: a' }] },
      outputDimensionality: 4,
    });
  });

  it('embeds query text for image search with the query prefix', async () => {
    const { sent, impl } = fakeGemini();
    await geminiEmbedder({ apiKey: 'k', dims: 4, fetch: impl }).embedText(['red car']);
    expect(sent[0]!.body.requests[0]!.content.parts[0]).toEqual({
      text: 'task: search result | query: red car',
    });
  });

  it('sends images inline as base64, at most 6 per call, in order', async () => {
    const { sent, impl } = fakeGemini();
    const images = Array.from({ length: 8 }, (_, i) => (i % 2 ? png : jpeg));

    const vectors = await geminiEmbedder({ apiKey: 'k', dims: 4, fetch: impl }).embedImages(images);

    expect(sent.map((s) => s.body.requests.length)).toEqual([6, 2]);
    expect(vectors).toHaveLength(8);
    expect(vectors[6]![0]).toBe(200);
    expect(sent[0]!.body.requests[1]!.content.parts[0]).toEqual({
      inlineData: { mimeType: 'image/png', data: png.toString('base64') },
    });
  });

  it('rejects a reply with the wrong number or size of vectors', async () => {
    const { impl } = fakeGemini(3);
    await expect(
      geminiEmbedder({ apiKey: 'k', dims: 4, fetch: impl }).embed(['a'], 'query'),
    ).rejects.toThrow(ProviderError);
  });

  it('reads retryDelay from a 429 body', async () => {
    const body = JSON.stringify({
      error: { code: 429, details: [{ '@type': 'RetryInfo', retryDelay: '17s' }] },
    });
    const { impl } = fakeGemini(4, new Response(body, { status: 429 }));
    const err = await geminiEmbedder({ apiKey: 'k', dims: 4, fetch: impl })
      .embed(['a'], 'query')
      .catch((e: unknown) => e);
    expect(err).toMatchObject({
      provider: 'gemini',
      status: 429,
      retryAfterMs: 17_000,
      retryable: true,
    });
  });
});
