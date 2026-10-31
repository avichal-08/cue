import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '@cue/core';
import * as schema from './schema';

export const db = drizzle(neon(env().DATABASE_URL), { schema });
export type Db = typeof db;
