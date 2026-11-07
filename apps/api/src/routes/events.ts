import { Router } from 'express';
import { z } from 'zod';
import { progressChannel, type ProgressEvent } from '@cue/core';
import { HttpError } from '../errors';
import { redis } from '../redis';

type Listener = (event: ProgressEvent) => void;

const listeners = new Set<Listener>();
let subscribed: Promise<unknown> | undefined;

function subscribe() {
  if (subscribed) return subscribed;
  const sub = redis.duplicate();
  sub.on('pmessage', (_pattern, _channel, message: string) => {
    const event = JSON.parse(message) as ProgressEvent;
    for (const listener of listeners) listener(event);
  });
  subscribed = sub.psubscribe(progressChannel('*'));
  return subscribed;
}

const query = z.object({ video: z.string().uuid().optional() });
const pingMs = 15_000;

export const events = Router();

events.get('/', async (req, res) => {
  const parsed = query.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, 'video must be a uuid');
  const { video } = parsed.data;
  await subscribe();

  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  });
  res.write(': connected\n\n');

  const listener: Listener = (event) => {
    if (!video || event.videoId === video) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  listeners.add(listener);
  const ping = setInterval(() => res.write(': ping\n\n'), pingMs);

  req.on('close', () => {
    clearInterval(ping);
    listeners.delete(listener);
  });
});
