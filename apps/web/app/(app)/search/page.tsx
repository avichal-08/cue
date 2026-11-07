'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { timecode } from '../../../lib/api';
import { askAnswer } from '../../../lib/answer';
import { clipKey, search, type SearchClip, type SearchResponse } from '../../../lib/search';
import { AnswerPanel, type AnswerState } from './answer';
import { ClipPlayer } from './clip-player';
import { Highlight, MatchBadges } from './match';
import styles from './search.module.css';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; result: SearchResponse };

function distinctTexts(clip: SearchClip) {
  const seen = new Set<string>();
  const texts: { kind: 'transcript' | 'ocr'; text: string }[] = [];
  for (const s of clip.segments) {
    for (const [kind, text] of [
      ['transcript', s.transcriptText],
      ['ocr', s.ocrText],
    ] as const) {
      const key = `${kind}:${text?.replace(/\s+/g, ' ').trim()}`;
      if (!text || seen.has(key)) continue;
      seen.add(key);
      texts.push({ kind, text });
    }
  }
  return texts;
}

function readQuery() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('q') ?? '';
}

export default function Search() {
  const [query, setQuery] = useState('');
  const [keyframes, setKeyframes] = useState(false);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [selected, setSelected] = useState<SearchClip | null>(null);
  const [answer, setAnswer] = useState<AnswerState | null>(null);
  const searchId = useRef(0);
  const player = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  async function answerFor(id: number, q: string, clips: SearchClip[]) {
    setAnswer({ kind: 'loading' });
    try {
      const response = await askAnswer(q, clips);
      if (searchId.current === id) setAnswer({ kind: 'done', answer: response });
    } catch (err) {
      if (searchId.current === id)
        setAnswer({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  function cite(clip: SearchClip) {
    setSelected(clip);
    player.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function run(q: string) {
    const text = q.trim();
    if (!text) return;
    const id = ++searchId.current;
    setState({ kind: 'loading' });
    setSelected(null);
    setAnswer(null);
    const url = new URL(window.location.href);
    url.searchParams.set('q', text);
    window.history.replaceState(null, '', url);
    try {
      const result = await search(text, keyframes);
      if (searchId.current !== id) return;
      setState({ kind: 'done', result });
      setSelected(result.clips[0] ?? null);
      if (result.clips.length) void answerFor(id, result.query, result.clips);
    } catch (err) {
      if (searchId.current === id)
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const initial = readQuery();
    if (initial) {
      setQuery(initial);
      void run(initial);
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        field.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(query);
  }

  const result = state.kind === 'done' ? state.result : null;
  const loading = state.kind === 'loading';

  return (
    <>
      <span className="eyebrow">search</span>
      <h1 className={styles.title}>
        Ask your library.
        <span className={styles.quiet}> Get the moment back.</span>
      </h1>

      <form className={styles.form} onSubmit={submit} role="search">
        <div className={`${styles.box} ${loading ? styles.busy : ''}`}>
          <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden>
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" />
          </svg>
          <input
            ref={field}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Where do they explain rank fusion?"
            aria-label="search query"
            autoFocus
          />
          {!query && <kbd className="mono">/</kbd>}
          <button type="submit" className="btn btn-primary" disabled={!query.trim() || loading}>
            {loading ? 'Searching' : 'Search'}
          </button>
        </div>
        <div className={styles.options}>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={keyframes}
              onChange={(e) => setKeyframes(e.target.checked)}
            />
            <span className={styles.track} aria-hidden />
            Look at keyframes when ranking
          </label>
          <span className="quiet">
            Narrow with <code className="mono">video:&lt;id&gt;</code>{' '}
            <code className="mono">from:1:30</code> <code className="mono">to:5m</code>
          </span>
        </div>
      </form>

      {state.kind === 'error' && <p className={styles.error}>{state.message}</p>}

      {result && (
        <>
          <p className={`mono ${styles.meta}`}>
            {result.clips.length} {result.clips.length === 1 ? 'clip' : 'clips'} in{' '}
            {(result.meta.timings.totalMs / 1000).toFixed(1)}s
            {result.meta.reranked ? ' · reranked' : ''}
            {result.meta.rerankError ? ' · rerank unavailable, fused order' : ''}
          </p>

          {result.clips.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Nothing in your library matches that.</p>
              <p className="quiet">
                Try other words, or check that the video you have in mind is{' '}
                <Link href="/videos">ready in the library</Link>.
              </p>
            </div>
          ) : (
            <>
              {answer && <AnswerPanel state={answer} clips={result.clips} onCite={cite} />}

              <div ref={player} className={styles.playerSlot}>
                {selected?.playbackUrl && (
                  <ClipPlayer
                    clip={{
                      key: clipKey(selected),
                      src: selected.playbackUrl,
                      title: selected.title,
                      startMs: selected.startMs,
                      endMs: selected.endMs,
                    }}
                  />
                )}
              </div>

              <ol className={styles.results}>
                {result.clips.map((clip, i) => {
                  const active = selected && clipKey(selected) === clipKey(clip);
                  return (
                    <li key={clipKey(clip)}>
                      <button
                        type="button"
                        className={`${styles.clip} ${active ? styles.active : ''}`}
                        onClick={() => setSelected(clip)}
                        aria-pressed={!!active}
                      >
                        <span className={styles.thumb}>
                          {clip.keyframeUrl ? <img src={clip.keyframeUrl} alt="" /> : <span />}
                          <span className={`mono ${styles.rank}`}>{i + 1}</span>
                        </span>
                        <span className={styles.body}>
                          <span className={styles.head}>
                            <strong>{clip.title}</strong>
                            <span className={`mono ${styles.time}`}>
                              {timecode(clip.startMs)} → {timecode(clip.endMs)}
                            </span>
                          </span>
                          {clip.reason && <span className={styles.reason}>{clip.reason}</span>}
                          <span className={styles.signals}>
                            <MatchBadges matchedBy={clip.matchedBy} />
                            {clip.score !== null && (
                              <span
                                className={styles.meter}
                                title={`relevance ${Math.round(clip.score * 100)}%`}
                              >
                                <span style={{ width: `${clip.score * 100}%` }} />
                              </span>
                            )}
                          </span>
                          <span className={styles.texts}>
                            {distinctTexts(clip).map((t) => (
                              <span
                                key={`${t.kind}:${t.text}`}
                                className={t.kind === 'ocr' ? styles.ocr : undefined}
                              >
                                <Highlight text={t.text} query={result.query} />
                              </span>
                            ))}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </>
      )}
    </>
  );
}
