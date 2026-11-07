import type { StageState } from '../../../lib/progress';
import styles from './stages.module.css';

export function currentStage(stages: StageState[]) {
  return (
    stages.find((s) => s.status === 'failed') ??
    stages.find((s) => s.status === 'running') ??
    stages.find((s) => s.status !== 'done')
  );
}

export function StageBar({ stages, compact = false }: { stages: StageState[]; compact?: boolean }) {
  const now = currentStage(stages);
  return (
    <div className={compact ? styles.compact : styles.full}>
      <ol className={styles.track} aria-label="ingest progress">
        {stages.map((s) => (
          <li
            key={s.stage}
            className={`${styles.step} ${styles[s.status]}`}
            title={s.error ?? `${s.stage}: ${s.status}`}
          >
            <span className={styles.bar}>
              <span style={{ width: `${s.status === 'done' ? 100 : s.progress}%` }} />
            </span>
            {!compact && <span className={styles.name}>{s.stage}</span>}
          </li>
        ))}
      </ol>
      {compact && now && (
        <span className={`mono ${styles.now}`}>
          {now.stage}
          {now.status === 'running' && now.progress > 0 ? ` ${now.progress}%` : ''}
          {now.status === 'failed' ? ' failed' : ''}
        </span>
      )}
    </div>
  );
}
