'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatMs } from '../../lib/api';
import { askAnswer } from '../../lib/answer';
import { clipKey, search, type SearchClip, type SearchResponse } from '../../lib/search';
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

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(query);
  }

  const result = state.kind === 'done' ? state.result : null;

  return (
    <>
      <h1>search</h1>
      <form className={styles.form} onSubmit={submit} role="search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="what are you looking for? e.g. where they explain rank fusion"
          aria-label="search query"
          autoFocus
        />
        <button type="submit" disabled={!query.trim() || state.kind === 'loading'}>
          search
        </button>
        <label className={styles.option}>
          <input
            type="checkbox"
            checked={keyframes}
            onChange={(e) => setKeyframes(e.target.checked)}
          />
          look at keyframes (slower)
        </label>
        <p className={styles.hint}>
          narrow with <code>video:&lt;id&gt;</code>, <code>from:1:30</code>, <code>to:5m</code>
        </p>
      </form>

      {state.kind === 'loading' && <p className="muted">searching…</p>}
      {state.kind === 'error' && <p className={styles.error}>{state.message}</p>}

      {result && (
        <>
          <p className={styles.meta}>
            {result.clips.length} {result.clips.length === 1 ? 'clip' : 'clips'} ·{' '}
            {(result.meta.timings.totalMs / 1000).toFixed(1)}s
            {result.meta.reranked ? ' · reranked' : ''}
            {result.meta.rerankError ? ' · rerank unavailable, showing fused order' : ''}
          </p>

          {answer && <AnswerPanel state={answer} clips={result.clips} onCite={cite} />}

          <div ref={player}>
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

          {result.clips.length === 0 ? (
            <p className="muted">
              nothing relevant found for “{result.query}”. try other words, or{' '}
              <Link href="/videos">check which videos are ready</Link>.
            </p>
          ) : (
            <ol className={styles.results}>
              {result.clips.map((clip) => {
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
                        {clip.keyframeUrl ? <img src={clip.keyframeUrl} alt="" /> : null}
                        <span className={styles.time}>
                          {formatMs(clip.startMs)}–{formatMs(clip.endMs)}
                        </span>
                      </span>
                      <span className={styles.body}>
                        <span className={styles.head}>
                          <strong>{clip.title}</strong>
                          {clip.score !== null && (
                            <span className={styles.score}>{Math.round(clip.score * 100)}%</span>
                          )}
                        </span>
                        {clip.reason && <span className={styles.reason}>{clip.reason}</span>}
                        <MatchBadges matchedBy={clip.matchedBy} />
                        <span className={styles.text}>
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
          )}
        </>
      )}
    </>
  );
}
