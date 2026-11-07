import { describe, expect, it } from 'vitest';
import { candidateText, geminiReranker, parseRerankReply, rerankPrompt } from '../src/gemini';
import type { RerankCandidate } from '../src/providers';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const candidates: RerankCandidate[] = [
  { id: 'seg-a', text: 'we set up pgvector' },
  { id: 'seg-b', text: 'pasta recipe' },
  { id: 'seg-c', text: 'recall at 10' },
];
const reply = (items: unknown) => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify(items) }] } }],
});

function fakeFetch(response: Response) {
  const sent: { url: string; body: { contents: { parts: Record<string, unknown>[] }[] } }[] = [];
  const impl: typeof fetch = (url, init) => {
    sent.push({
      url: url as string,
      body: JSON.parse(init!.body as string) as (typeof sent)[0]['body'],
    });
    return Promise.resolve(response);
  };
  return { sent, impl };
}

describe('parseRerankReply', () => {
  it('maps short ids back, scales scores to 0..1 and sorts', () => {
    const results = parseRerankReply(
      reply([
        { id: 'c2', reason: 'about cooking', score: 0 },
        { id: 'c1', reason: 'sets up pgvector', score: 9 },
        { id: 'c3', reason: 'evaluation metric', score: 4 },
      ]),
      candidates,
      10,
    );
    expect(results).toEqual([
      { id: 'seg-a', score: 0.9, reason: 'sets up pgvector' },
      { id: 'seg-c', score: 0.4, reason: 'evaluation metric' },
      { id: 'seg-b', score: 0, reason: 'about cooking' },
    ]);
  });

  it('ignores unknown ids, duplicates and bad scores, and clamps the range', () => {
    const results = parseRerankReply(
      reply([
        { id: 'c9', score: 10 },
        { id: 'seg-a', score: 10 },
        { id: ' c1 ', score: 14, reason: 'x' },
        { id: 'c1', score: 2 },
        { id: 'c2', score: 'high' },
        { id: 'c3', score: -3 },
      ]),
      candidates,
      10,
    );
    expect(results.map((r) => [r.id, r.score])).toEqual([
      ['seg-a', 1],
      ['seg-c', 0],
    ]);
  });

  it('keeps only the top k', () => {
    const items = [1, 2, 3].map((n) => ({ id: `c${n}`, reason: '', score: n }));
    expect(parseRerankReply(reply(items), candidates, 2).map((r) => r.id)).toEqual([
      'seg-c',
      'seg-b',
    ]);
  });
});

describe('prompt parts', () => {
  it('mentions images only when there are images and truncates long text', () => {
    expect(rerankPrompt('q', 3, false)).not.toContain('keyframe');
    expect(rerankPrompt('q', 3, true)).toContain('keyframe image');
    const long = candidateText({ id: 'x', text: 'a'.repeat(2000) }, 'c1');
    expect(long.startsWith('[c1]\n')).toBe(true);
    expect(long.length).toBeLessThan(820);
    expect(candidateText({ id: 'x', text: '' }, 'c2')).toBe('[c2]\n(no text)');
  });
});

describe('geminiReranker', () => {
  it('asks for a scored list, labelling candidates and inlining images', async () => {
    const { sent, impl } = fakeFetch(Response.json(reply([{ id: 'c1', reason: 'r', score: 7 }])));
    const reranker = geminiReranker({ apiKey: 'k', fetch: impl });

    const results = await reranker.rerank(
      'pgvector setup',
      [{ ...candidates[0]!, image: jpeg }, candidates[1]!],
      5,
    );

    expect(results).toEqual([{ id: 'seg-a', score: 0.7, reason: 'r' }]);
    expect(sent[0]!.url).toContain('/models/gemini-3.5-flash-lite:generateContent');
    const parts = sent[0]!.body.contents[0]!.parts;
    expect(parts[0]!.text).toContain('pgvector setup');
    expect(parts[1]).toEqual({ text: '[c1]\nwe set up pgvector' });
    expect(parts[2]).toEqual({
      inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') },
    });
    expect(parts[3]).toEqual({ text: '[c2]\npasta recipe' });
  });

  it('skips the call for no candidates', async () => {
    const { sent, impl } = fakeFetch(Response.json({}));
    expect(await geminiReranker({ apiKey: 'k', fetch: impl }).rerank('q', [], 5)).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  it('turns a broken reply into a retryable error', async () => {
    const bad = { candidates: [{ content: { parts: [{ text: '[{"id":' }] } }] };
    const { impl } = fakeFetch(Response.json(bad));
    const err = await geminiReranker({ apiKey: 'k', fetch: impl })
      .rerank('q', candidates, 5)
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, retryable: true });
  });
});
