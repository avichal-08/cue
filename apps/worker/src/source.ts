import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { UnrecoverableError } from "bullmq";
import { deleteObject, env, hashObject, uploadStream } from "@cue/core";
import { claimContentHash, db, videos } from "@cue/db";
import { eq } from "drizzle-orm";

const videoExts = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"]);

function isDirectMedia(url: URL, contentType: string | null) {
  return contentType?.startsWith("video/") || videoExts.has(extname(url.pathname).toLowerCase());
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) =>
      reject((e as NodeJS.ErrnoException).code === "ENOENT" ? new Error(`${cmd} not installed`) : e),
    );
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim() || `${cmd} exited ${code}`))));
  });
}

async function fetchDirect(url: URL, key: (ext: string) => string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`);
  const ext = extname(url.pathname).toLowerCase();
  const storageKey = key(videoExts.has(ext) ? ext : ".mp4");
  await uploadStream(storageKey, Readable.fromWeb(res.body as ReadableStream), res.headers.get("content-type") ?? undefined);
  return { storageKey };
}

async function fetchWithYtDlp(url: URL, key: (ext: string) => string) {
  const dir = await mkdtemp(join(tmpdir(), "cue-"));
  try {
    const out = await run(env().YTDLP_PATH, [
      "--no-playlist",
      "-f",
      "b[ext=mp4]/b",
      "-o",
      join(dir, "source.%(ext)s"),
      "--print",
      "title",
      "--print",
      "after_move:filepath",
      "--no-simulate",
      url.href,
    ]);
    const [title, filepath] = out.trim().split(/\r?\n/);
    if (!filepath) throw new Error("yt-dlp gave no file");
    const storageKey = key(extname(filepath).toLowerCase() || ".mp4");
    await uploadStream(storageKey, createReadStream(filepath));
    return { storageKey, title };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function fetchSource(videoId: string) {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) throw new UnrecoverableError("video not found");
  if (video.sourceType !== "url" || video.storageKey) return;

  const url = new URL(video.sourceUrl!);
  const key = (ext: string) => `videos/${video.id}/source${ext}`;
  const head = await fetch(url, { method: "HEAD" }).catch(() => undefined);
  const { storageKey, title } = isDirectMedia(url, head?.headers.get("content-type") ?? null)
    ? { ...(await fetchDirect(url, key)), title: undefined }
    : await fetchWithYtDlp(url, key);

  const contentHash = await hashObject(storageKey);
  const existing = await claimContentHash(video.id, contentHash);
  if (existing) {
    await deleteObject(storageKey);
    await db
      .update(videos)
      .set({ status: "failed", error: `duplicate of ${existing}` })
      .where(eq(videos.id, video.id));
    throw new UnrecoverableError(`duplicate of ${existing}`);
  }

  await db
    .update(videos)
    .set({ storageKey, ...(title && video.title === video.sourceUrl ? { title } : {}) })
    .where(eq(videos.id, video.id));
}
