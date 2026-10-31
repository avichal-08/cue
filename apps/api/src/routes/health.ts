import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@cue/db';
import { redis } from '../redis';

export const health = Router();

async function check(fn: () => Promise<unknown>) {
  try {
    await fn();
    return 'ok';
  } catch (err) {
    return (err as Error).message;
  }
}

health.get('/', async (_req, res) => {
  const [database, cache] = await Promise.all([
    check(() => db.execute(sql`select 1`)),
    check(() => redis.ping()),
  ]);
  const ok = database === 'ok' && cache === 'ok';
  res.status(ok ? 200 : 503).json({ ok, db: database, redis: cache });
});
