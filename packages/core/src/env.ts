import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().default("cue"),
  S3_ACCESS_KEY: z.string().default("cue"),
  S3_SECRET_KEY: z.string().default("cuecuecue"),
  YTDLP_PATH: z.string().default("yt-dlp"),
  API_PORT: z.coerce.number().int().default(4000),
  OPENAI_API_KEY: z.string().optional(),
  VOYAGE_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
