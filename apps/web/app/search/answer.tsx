import { formatMs } from '../../lib/api';
import type { AnswerResponse } from '../../lib/answer';
import type { SearchClip } from '../../lib/search';
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
    return <section className={styles.panel}>writing an answer from these clips…</section>;
  }
  if (state.kind === 'error') {
    return (
      <section className={`${styles.panel} ${styles.muted}`}>no answer: {state.message}</section>
    );
  }

  const { answer } = state;
  const parts = answer.answer.split(/(\[\d+\])/);
  return (
    <section
      className={`${styles.panel} ${answer.grounded ? '' : styles.muted}`}
      aria-label="answer"
    >
      <p className={styles.text}>
        {parts.map((part, i) => {
          const n = /^\[(\d+)\]$/.exec(part)?.[1];
          const clip = n ? clips[Number(n) - 1] : undefined;
          if (!n || !clip) return <span key={i}>{part}</span>;
          const label = `${clip.title} ${formatMs(clip.startMs)}–${formatMs(clip.endMs)}`;
          return (
            <button
              key={i}
              type="button"
              className={styles.cite}
              onClick={() => onCite(clip)}
              title={`play ${label}`}
              aria-label={`source ${n}: ${label}`}
            >
              {n}
            </button>
          );
        })}
      </p>
      {answer.grounded && (
        <p className={styles.note}>
          answered only from the clips below · {(answer.ms / 1000).toFixed(1)}s
        </p>
      )}
    </section>
  );
}
