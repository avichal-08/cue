import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default('cue'),
  S3_ACCESS_KEY: z.string().default('cue'),
  S3_SECRET_KEY: z.string().default('cuecuecue'),
  YTDLP_PATH: z.string().default('yt-dlp'),
  API_PORT: z.coerce.number().int().default(4000),
  GROQ_API_KEY: z.string().optional(),
  GROQ_STT_MODEL: z.string().default('whisper-large-v3-turbo'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_EMBED_MODEL: z.string().default('gemini-embedding-2'),
  GEMINI_FLASH_MODEL: z.string().default('gemini-3.5-flash-lite'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
