import { describe, expect, it } from 'vitest';
import { nextStage, progressChannel, queueName, stages } from '../src/queues';

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
});
