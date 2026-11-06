import { Redis } from 'ioredis';
import { env, progressChannel, type ProgressEvent } from '@cue/core';

export const redis = new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });

export async function publish(event: ProgressEvent) {
  await redis.publish(progressChannel(event.videoId), JSON.stringify(event));
}
