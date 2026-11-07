import type { ReactNode } from 'react';
import styles from './page-header.module.css';

interface Props {
  eyebrow: string;
  title: ReactNode;
  quiet?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, quiet, actions }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <span className="eyebrow">{eyebrow}</span>
        <h1 className={styles.title}>
          {title}
          {quiet ? <span className={styles.quiet}> {quiet}</span> : null}
        </h1>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
