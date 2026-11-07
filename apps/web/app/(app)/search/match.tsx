import type { ReactNode } from 'react';
import styles from './match.module.css';

export type Modality = 'transcript' | 'ocr' | 'visual' | 'keyword';

export interface MatchInfo {
  rank: number;
  score: number;
}

const labels: Record<Modality, string> = {
  transcript: 'said',
  ocr: 'on screen',
  visual: 'visual',
  keyword: 'keyword',
};

const order: Modality[] = ['transcript', 'ocr', 'visual', 'keyword'];

export function MatchBadges({ matchedBy }: { matchedBy: Partial<Record<Modality, MatchInfo>> }) {
  const present = order.filter((m) => matchedBy[m]);
  if (!present.length) return null;
  return (
    <ul className={styles.badges} aria-label="matched by">
      {present.map((m) => {
        const match = matchedBy[m]!;
        const detail =
          m === 'keyword'
            ? `keyword rank ${match.rank}`
            : `${labels[m]} rank ${match.rank}, similarity ${match.score.toFixed(2)}`;
        return (
          <li key={m} className={`${styles.badge} ${styles[m]}`} title={detail}>
            {labels[m]}
          </li>
        );
      })}
    </ul>
  );
}

const stopWords = new Set(
  'a an and are as at be by for from how i in is it of on or show me that the this to was what when where which who why with you do does did can'.split(
    ' ',
  ),
);

export function queryStems(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length > 1 && !stopWords.has(w))
        .map((w) => w.replace(/(ies|es|s|ing|ed)$/u, '') || w),
    ),
  ].filter((s) => s.length > 1);
}

export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const stems = queryStems(query);
  if (!stems.length) return [{ text, hit: false }];
  const parts: { text: string; hit: boolean }[] = [];
  for (const piece of text.split(/([\p{L}\p{N}]+)/u)) {
    if (!piece) continue;
    const lower = piece.toLowerCase();
    const hit = stems.some((s) => lower.startsWith(s));
    const last = parts.at(-1);
    if (last && last.hit === hit && !hit) last.text += piece;
    else parts.push({ text: piece, hit });
  }
  return parts;
}

export function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  return highlightParts(text, query).map((p, i) =>
    p.hit ? (
      <mark key={i} className={styles.mark}>
        {p.text}
      </mark>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}
