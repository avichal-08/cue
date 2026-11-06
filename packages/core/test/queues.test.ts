import { describe, expect, it } from 'vitest';
import {
  nextStage,
  progressChannel,
  queueName,
  stageInputHash,
  stageJobId,
  stages,
} from '../src/queues';

describe('queues', () => {
  it('runs stages in pipeline order', () => {
    expect(stages).toEqual(['decode', 'segment', 'transcribe', 'see', 'index']);
  });

  it('chains each stage to the next and ends after index', () => {
    expect(nextStage('decode')).toBe('segment');
    expect(nextStage('see')).toBe('index');
    expect(nextStage('index')).toBeUndefined();
  });

  it('names queues and progress channels per stage and video', () => {
    expect(queueName('transcribe')).toBe('cue-transcribe');
    expect(progressChannel('abc')).toBe('cue:progress:abc');
  });

  it('gives each stage of a video one job id', () => {
    expect(stageJobId('abc', 'see')).toBe('abc-see');
  });

  it('changes the input hash when stage, source or upstream change', () => {
    const base = stageInputHash('segment', 'h1', 'u1');
    expect(stageInputHash('segment', 'h1', 'u1')).toBe(base);
    expect(stageInputHash('transcribe', 'h1', 'u1')).not.toBe(base);
    expect(stageInputHash('segment', 'h2', 'u1')).not.toBe(base);
    expect(stageInputHash('segment', 'h1', 'u2')).not.toBe(base);
  });
});
