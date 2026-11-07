import { describe, expect, it } from 'vitest';
import { sourceText } from '../src/search/answer';

const clip = { videoId: 'v', startMs: 39_600, endMs: 48_400 };

describe('sourceText', () => {
  it('labels the source with its video and time, then speech and on-screen text', () => {
    expect(
      sourceText('Talk', clip, [
        { transcriptText: 'we measure recall', ocrText: 'Evaluating\n\n- Recall at 10' },
      ]),
    ).toBe(
      'video "Talk" at 0:39-0:48\nsaid: we measure recall\non screen: Evaluating - Recall at 10',
    );
  });

  it('removes repeated text across merged segments', () => {
    const text = sourceText('Talk', clip, [
      { transcriptText: 'same line', ocrText: 'Slide A' },
      { transcriptText: 'same line', ocrText: 'Slide  A' },
      { transcriptText: 'next line', ocrText: null },
    ]);
    expect(text).toBe('video "Talk" at 0:39-0:48\nsaid: same line next line\non screen: Slide A');
  });

  it('says when a clip has no text', () => {
    expect(sourceText('Colours', clip, [{ transcriptText: null, ocrText: null }])).toContain(
      '(no speech or on-screen text)',
    );
  });
});
