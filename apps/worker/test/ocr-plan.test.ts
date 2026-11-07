import { describe, expect, it } from 'vitest';
import { planOcr } from '../src/ocr-plan';

const unit = (...xs: number[]) => {
  const n = Math.hypot(...xs);
  return xs.map((x) => x / n);
};

const slide = unit(1, 0, 0);
const slideNoise = unit(1, 0.1, 0);
const other = unit(0, 1, 0);

describe('planOcr', () => {
  it('reads the first keyframe and copies near-duplicates of it', () => {
    expect(
      planOcr([
        { id: 'a', vector: slide },
        { id: 'b', vector: slideNoise },
      ]),
    ).toEqual([
      { id: 'a', read: true },
      { id: 'b', read: false, copyFrom: 'a' },
    ]);
  });

  it('reads again when the picture changes', () => {
    expect(
      planOcr([
        { id: 'a', vector: slide },
        { id: 'b', vector: other },
        { id: 'c', vector: slide },
      ]).map((s) => s.read),
    ).toEqual([true, true, true]);
  });

  it('compares with the last frame that was read, so slow drift is caught', () => {
    const steps = [0, 0.1, 0.2, 0.3].map((y, i) => ({ id: `f${i}`, vector: unit(1, y, 0) }));
    expect(planOcr(steps).map((s) => (s.read ? 'read' : `copy ${s.copyFrom}`))).toEqual([
      'read',
      'copy f0',
      'copy f0',
      'read',
    ]);
  });

  it('skips segments without a keyframe vector', () => {
    expect(planOcr([{ id: 'a' }, { id: 'b', vector: slide }])).toEqual([
      { id: 'a', read: false },
      { id: 'b', read: true },
    ]);
  });

  it('honours a custom threshold', () => {
    const steps = [
      { id: 'a', vector: slide },
      { id: 'b', vector: slideNoise },
    ];
    expect(planOcr(steps, 0.999).map((s) => s.read)).toEqual([true, true]);
  });
});
