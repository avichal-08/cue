import { timecode } from '../../../lib/api';
import type { AnswerResponse } from '../../../lib/answer';
import type { SearchClip } from '../../../lib/search';
import styles from './answer.module.css';

export type AnswerState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; answer: AnswerResponse };

interface Props {
  state: AnswerState;
  clips: SearchClip[];
  onCite: (clip: SearchClip) => void;
}

export function AnswerPanel({ state, clips, onCite }: Props) {
  if (state.kind === 'loading') {
    return (
      <section className={styles.panel} aria-busy="true">
        <span className="eyebrow">
          <span className="cue-dot" /> answer
        </span>
        <div className={styles.lines} aria-label="writing an answer">
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  }

  if (state.kind === 'error') {
    return (
      <section className={`${styles.panel} ${styles.muted}`}>
        <span className="eyebrow">answer</span>
        <p className={styles.text}>No answer this time: {state.message}</p>
      </section>
    );
  }

  const { answer } = state;
  const parts = answer.answer.split(/(\[\d+\])/);
  const cited = answer.citations
    .map((c) => ({ n: c.n, clip: clips[c.n - 1] }))
    .filter((c): c is { n: number; clip: SearchClip } => !!c.clip);

  return (
    <section
      className={`${styles.panel} ${answer.grounded ? '' : styles.muted}`}
      aria-label="answer"
    >
      <span className="eyebrow">
        {answer.grounded ? <span className="cue-dot" /> : null}
        {answer.grounded ? 'answer' : 'not covered'}
      </span>
      <p className={styles.text}>
        {parts.map((part, i) => {
          const n = /^\[(\d+)\]$/.exec(part)?.[1];
          const clip = n ? clips[Number(n) - 1] : undefined;
          if (!n || !clip) return <span key={i}>{part}</span>;
          return (
            <button
              key={i}
              type="button"
              className={styles.cite}
              onClick={() => onCite(clip)}
              title={`play ${clip.title} at ${timecode(clip.startMs)}`}
              aria-label={`source ${n}: ${clip.title} at ${timecode(clip.startMs)}`}
            >
              {n}
            </button>
          );
        })}
      </p>
      {cited.length > 0 && (
        <ul className={styles.sources}>
          {cited.map(({ n, clip }) => (
            <li key={n}>
              <button type="button" onClick={() => onCite(clip)}>
                <span className={styles.cite}>{n}</span>
                <span className={styles.sourceTitle}>{clip.title}</span>
                <span className="mono quiet">{timecode(clip.startMs)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
