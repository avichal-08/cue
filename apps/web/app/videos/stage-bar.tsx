import type { StageState } from '../../lib/progress';
import styles from './videos.module.css';

export function StageBar({ stages }: { stages: StageState[] }) {
  return (
    <ol className={styles.stages}>
      {stages.map((s) => (
        <li
          key={s.stage}
          className={`${styles.stage} ${styles[s.status]}`}
          title={s.error ?? `${s.stage}: ${s.status}`}
        >
          <span
            className={styles.fill}
            style={{ width: `${s.status === 'done' ? 100 : s.progress}%` }}
          />
          <span className={styles.label}>{s.stage}</span>
        </li>
      ))}
    </ol>
  );
}
