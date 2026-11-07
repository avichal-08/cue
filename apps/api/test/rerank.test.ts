import { describe, expect, it } from 'vitest';
import type { Fused } from '../src/search/fuse';
import { applyRerank, candidateFor, hasEvidence, type CandidateRow } from '../src/search/rerank';

const hit = (segmentId: string, score: number): Fused => ({ segmentId, score, matches: {} });
const hits = [hit('a', 0.05), hit('b', 0.04), hit('c', 0.03), hit('d', 0.02)];

describe('applyRerank', () => {
  it('orders by rerank score and keeps the reason', () => {
    const out = applyRerank(hits.slice(0, 3), [
      { id: 'c', score: 0.9, reason: 'answers it' },
      { id: 'a', score: 0.5, reason: 'related' },
      { id: 'b', score: 0.6 },
    ]);
    expect(out.map((h) => [h.segmentId, h.rerankScore, h.reason])).toEqual([
      ['c', 0.9, 'answers it'],
      ['b', 0.6, undefined],
      ['a', 0.5, 'related'],
    ]);
  });

  it('drops candidates the reranker scored below the floor', () => {
    const out = applyRerank(hits.slice(0, 2), [
      { id: 'a', score: 0.2 },
      { id: 'b', score: 0.3 },
    ]);
    expect(out.map((h) => h.segmentId)).toEqual(['b']);
  });

  it('keeps candidates the reranker did not score, after the scored ones, in fused order', () => {
    const out = applyRerank(hits, [{ id: 'c', score: 0.8 }]);
    expect(out.map((h) => h.segmentId)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('breaks rerank ties by the fused score', () => {
    const out = applyRerank(hits.slice(0, 2), [
      { id: 'b', score: 0.7 },
      { id: 'a', score: 0.7 },
    ]);
    expect(out.map((h) => h.segmentId)).toEqual(['a', 'b']);
  });
});

describe('candidateFor', () => {
  const row: CandidateRow = {
    segmentId: 's',
    videoId: 'v',
    title: 'Talk',
    startMs: 65_000,
    endMs: 92_000,
    transcriptText: 'we use pgvector',
    ocrText: 'Hybrid Search\n\n- BM25',
    keyframeKey: null,
  };

  it('describes the segment with title, time, speech and on-screen text', () => {
    expect(candidateFor(row)).toEqual({
      id: 's',
      text: 'video: Talk (1:05-1:32)\nsaid: we use pgvector\non screen: Hybrid Search - BM25',
    });
  });

  it('attaches an image only when given and skips empty fields', () => {
    const image = Buffer.from('x');
    const c = candidateFor({ ...row, transcriptText: null, ocrText: null }, image);
    expect(c).toEqual({ id: 's', text: 'video: Talk (1:05-1:32)', image });
  });
});

describe('hasEvidence', () => {
  const row: CandidateRow = {
    segmentId: 's',
    videoId: 'v',
    title: 'colours',
    startMs: 0,
    endMs: 8_000,
    transcriptText: null,
    ocrText: '  ',
    keyframeKey: 'k',
  };

  it('needs speech, on-screen text or an image, not just a title', () => {
    expect(hasEvidence(row)).toBe(false);
    expect(hasEvidence(row, Buffer.from('x'))).toBe(true);
    expect(hasEvidence({ ...row, transcriptText: 'hello' })).toBe(true);
    expect(hasEvidence({ ...row, ocrText: 'Slide' })).toBe(true);
  });
});
