import Link from 'next/link';
import styles from './logo.module.css';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className={styles.logo} aria-label="cue home">
      <span className={styles.mark} aria-hidden>
        <span className={styles.dot} />
      </span>
      <span className={styles.word}>cue</span>
    </Link>
  );
}
