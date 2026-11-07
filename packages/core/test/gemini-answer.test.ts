import { describe, expect, it } from 'vitest';
import { answerPrompt, geminiAnswerer, parseAnswerReply } from '../src/gemini';
import type { AnswerSource } from '../src/providers';

const sources: AnswerSource[] = [
  { videoId: 'v1', startMs: 0, endMs: 10_000, text: 'we store vectors in pgvector' },
  { videoId: 'v2', startMs: 40_000, endMs: 48_000, text: 'measure recall at 10' },
];
const reply = (value: unknown) => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
});

describe('parseAnswerReply', () => {
  it('keeps valid citations and maps them to their sources', () => {
    const answer = parseAnswerReply(
      reply({
        grounded: true,
        answer: 'Vectors live in pgvector [1]. Quality is recall at 10 [2][1].',
      }),
      sources,
    );
    expect(answer.grounded).toBe(true);
    expect(answer.text).toBe('Vectors live in pgvector [1]. Quality is recall at 10 [2][1].');
    expect(answer.citations.map((c) => [c.n, c.videoId, c.startMs])).toEqual([
      [1, 'v1', 0],
      [2, 'v2', 40_000],
    ]);
  });

  it('drops citations that point at no source', () => {
    const answer = parseAnswerReply(
      reply({ grounded: true, answer: 'Uses pgvector [1][7] .' }),
      sources,
    );
    expect(answer.text).toBe('Uses pgvector [1].');
    expect(answer.citations.map((c) => c.n)).toEqual([1]);
  });

  it('treats an answer with no valid citation as not grounded', () => {
    expect(
      parseAnswerReply(reply({ grounded: true, answer: 'Probably Postgres [9].' }), sources),
    ).toEqual({
      text: 'Probably Postgres.',
      grounded: false,
      citations: [],
    });
  });

  it('respects the model saying the videos do not cover it', () => {
    const answer = parseAnswerReply(
      reply({ grounded: false, answer: 'The videos do not cover Kubernetes [1].' }),
      sources,
    );
    expect(answer).toMatchObject({ grounded: false, citations: [] });
  });

  it('rejects a reply without an answer', () => {
    expect(() => parseAnswerReply(reply({ grounded: true }), sources)).toThrow();
  });
});

describe('answerPrompt', () => {
  it('numbers the sources and asks for citations', () => {
    const prompt = answerPrompt('how is quality measured?', sources);
    expect(prompt).toContain('Question: how is quality measured?');
    expect(prompt).toContain('[1]\nwe store vectors in pgvector');
    expect(prompt).toContain('[2]\nmeasure recall at 10');
    expect(prompt).toContain('like [2] or [1][3]');
  });
});

describe('geminiAnswerer', () => {
  it('asks for a grounded json answer', async () => {
    let sent: { contents: { parts: { text: string }[] }[]; generationConfig: unknown } | undefined;
    const impl: typeof fetch = (_url, init) => {
      sent = JSON.parse(init!.body as string) as typeof sent;
      return Promise.resolve(Response.json(reply({ grounded: true, answer: 'Recall at 10 [2].' })));
    };
    const answer = await geminiAnswerer({ apiKey: 'k', fetch: impl }).answer('quality?', sources);
    expect(answer.citations.map((c) => c.n)).toEqual([2]);
    expect(sent!.contents[0]!.parts[0]!.text).toContain('Question: quality?');
    expect(sent!.generationConfig).toMatchObject({ responseMimeType: 'application/json' });
  });

  it('returns an empty, ungrounded answer for no sources without calling the api', async () => {
    let calls = 0;
    const impl: typeof fetch = () => {
      calls++;
      return Promise.resolve(Response.json({}));
    };
    expect(await geminiAnswerer({ apiKey: 'k', fetch: impl }).answer('q', [])).toEqual({
      text: '',
      grounded: false,
      citations: [],
    });
    expect(calls).toBe(0);
  });
});
