import Link from 'next/link';
import { Logo } from '../../components/logo';
import styles from './landing.module.css';

const stages = [
  { name: 'decode', detail: 'audio, frames, metadata' },
  { name: 'segment', detail: 'cuts on scene changes' },
  { name: 'transcribe', detail: 'every word, timed' },
  { name: 'see', detail: 'keyframes and on-screen text' },
  { name: 'index', detail: 'vectors, cached by content' },
];

const senses = [
  {
    key: 'said',
    title: 'What is said',
    body: 'Transcripts with word timings, so a clip starts and stops on a word, never inside one.',
  },
  {
    key: 'shown',
    title: 'What is on screen',
    body: 'Slides, code and captions read from each keyframe, searchable like the transcript.',
  },
  {
    key: 'seen',
    title: 'What it looks like',
    body: 'Keyframes embedded in the same space as your question, so you can search for a scene.',
  },
];

export default function Landing() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Logo />
        <nav className={styles.nav}>
          <Link href="/videos">Library</Link>
          <Link href="/search">Search</Link>
          <Link href="/upload" className="btn btn-quiet">
            Upload a video
          </Link>
        </nav>
      </header>

      <main className={styles.main}>
        <div className={styles.rail} aria-hidden />

        <section className={styles.hero}>
          <span className="eyebrow">
            <span className="cue-dot" /> multimodal video search
          </span>
          <h1 className={styles.title}>
            Find the moment,
            <br />
            <span className={styles.titleQuiet}>not the video.</span>
          </h1>
          <p className={styles.lede}>
            Cue listens to what is said, reads what is written on screen and looks at every scene.
            Ask in plain words and get the exact clip back, with the reason it matched.
          </p>
          <div className={styles.actions}>
            <Link href="/upload" className="btn btn-primary">
              Upload a video <span aria-hidden>↗</span>
            </Link>
            <Link href="/search" className="btn btn-link">
              Search your library <span aria-hidden>→</span>
            </Link>
          </div>

          <figure
            className={styles.preview}
            aria-label="cue search, showing a cited answer and a matching clip"
          >
            <div className={styles.query}>
              <span className={styles.queryIcon} aria-hidden />
              <span>where do they explain rank fusion?</span>
              <kbd className="mono">↵</kbd>
            </div>
            <p className={styles.previewAnswer}>
              They combine keyword and vector results with reciprocal rank fusion at k = 60, then
              rerank the top fifty with a model <span className={styles.cite}>1</span>.
            </p>
            <div className={styles.clip}>
              <div className={styles.frame} aria-hidden>
                <span className={styles.frameTitle} />
                <span className={styles.frameLine} />
                <span className={styles.frameLine} />
                <span className={`${styles.frameLine} ${styles.short}`} />
                <span className={styles.frameDot} />
              </div>
              <div className={styles.clipBody}>
                <div className={styles.clipHead}>
                  <strong>Hybrid search talk</strong>
                  <span className="mono quiet">00:20.0 → 00:40.4</span>
                </div>
                <p className={styles.clipReason}>Explains reciprocal rank fusion with k = 60.</p>
                <div className={styles.tags}>
                  <span className={styles.tagShown}>on screen</span>
                  <span className={styles.tagKeyword}>keyword</span>
                </div>
              </div>
            </div>
            <div className={styles.scrubber} aria-hidden>
              <span className={styles.span} />
              <span className={styles.playhead} />
            </div>
          </figure>
        </section>

        <section className={styles.section}>
          <span className="eyebrow mono">00:12 · ingest</span>
          <h2 className={styles.h2}>
            Upload once.
            <br />
            <span className={styles.titleQuiet}>Cue does the watching.</span>
          </h2>
          <p className={styles.sub}>
            Every video is broken into scenes, words and frames. Each one keeps its timestamp, so
            anything you find can be played back to the second.
          </p>
          <ol className={styles.track}>
            {stages.map((stage, i) => (
              <li key={stage.name} className={styles.stage}>
                <span className="mono quiet">{String(i + 1).padStart(2, '0')}</span>
                <strong>{stage.name}</strong>
                <span className={styles.stageDetail}>{stage.detail}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.section}>
          <span className="eyebrow mono">00:28 · matching</span>
          <h2 className={styles.h2}>
            Three ways to match.
            <br />
            <span className={styles.titleQuiet}>One ranked list.</span>
          </h2>
          <div className={styles.senses}>
            {senses.map((s) => (
              <article key={s.key} className={`${styles.sense} ${styles[s.key]}`}>
                <span className={styles.senseMark} aria-hidden />
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
          <p className={`mono ${styles.footnote}`}>
            + keyword search · reciprocal rank fusion · reranked with a reason
          </p>
        </section>

        <section className={`${styles.section} ${styles.split}`}>
          <div>
            <span className="eyebrow mono">00:41 · answers</span>
            <h2 className={styles.h2}>
              Answers that cite
              <br />
              <span className={styles.titleQuiet}>the exact second.</span>
            </h2>
            <p className={styles.sub}>
              Ask across your whole library. Cue answers from the clips it found and cites every
              claim; a citation plays its moment. When your videos don&apos;t cover the question, it
              says so instead of guessing.
            </p>
          </div>
          <figure className={styles.answer} aria-label="an answer with citations">
            <span className="eyebrow mono">how is retrieval quality measured?</span>
            <p>
              With recall at 1, 5 and 10 <span className={styles.cite}>1</span>, and by checking
              that each hit lands within five seconds of the right timestamp{' '}
              <span className={styles.cite}>1</span>. Each signal is switched off in turn to see
              what it adds <span className={styles.cite}>2</span>.
            </p>
            <ul className={styles.sources}>
              <li>
                <span className={styles.cite}>1</span> Evaluating retrieval
                <span className="mono quiet">00:39.6</span>
              </li>
              <li>
                <span className={styles.cite}>2</span> Ablations
                <span className="mono quiet">01:12.0</span>
              </li>
            </ul>
          </figure>
        </section>

        <section className={styles.closing}>
          <h2 className={styles.h2}>Bring a video. Ask it anything.</h2>
          <div className={styles.actions}>
            <Link href="/upload" className="btn btn-primary">
              Upload a video <span aria-hidden>↗</span>
            </Link>
            <Link href="/videos" className="btn btn-link">
              Open the library <span aria-hidden>→</span>
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <Logo />
        <span className="mono quiet">Groq · Gemini · pgvector</span>
        <a href="https://github.com/avichal-08/cue" className={styles.footerLink}>
          Source on GitHub ↗
        </a>
      </footer>
    </div>
  );
}
