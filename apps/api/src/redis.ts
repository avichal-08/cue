import { Redis } from 'ioredis';
import { env } from '@cue/core';

export const redis = new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
