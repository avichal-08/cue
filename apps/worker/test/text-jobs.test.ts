import { describe, expect, it } from 'vitest';
import { hashText, planTextJobs } from '../src/text-jobs';

describe('hashText', () => {
  it('is stable and depends on the role', () => {
    expect(hashText('hello')).toBe(hashText('hello'));
    expect(hashText('hello')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashText('hello', 'query')).not.toBe(hashText('hello', 'document'));
  });
});

describe('planTextJobs', () => {
  it('makes one job per non-empty transcript and ocr text', () => {
    const { jobs, texts } = planTextJobs([
      { id: 's0', transcriptText: 'we use pgvector', ocrText: 'Hybrid Search' },
      { id: 's1', transcriptText: null, ocrText: '   ' },
      { id: 's2', transcriptText: 'thanks', ocrText: null },
    ]);
    expect(jobs.map((j) => [j.segmentId, j.field])).toEqual([
      ['s0', 'transcript'],
      ['s0', 'ocr'],
      ['s2', 'transcript'],
    ]);
    expect([...texts.values()]).toEqual(['we use pgvector', 'Hybrid Search', 'thanks']);
  });

  it('embeds identical text once, even across fields and segments', () => {
    const { jobs, texts } = planTextJobs([
      { id: 's0', transcriptText: null, ocrText: 'Slide one\n\n- point' },
      { id: 's1', transcriptText: null, ocrText: 'Slide one - point' },
    ]);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.hash).toBe(jobs[1]!.hash);
    expect(texts.size).toBe(1);
  });
});
