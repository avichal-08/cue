import {
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const sourceType = pgEnum("source_type", ["upload", "url"]);
export const videoStatus = pgEnum("video_status", ["pending", "processing", "ready", "failed"]);
export const stage = pgEnum("stage", ["decode", "segment", "transcribe", "see", "index"]);
export const runStatus = pgEnum("run_status", ["queued", "running", "done", "failed"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const videos = pgTable(
  "videos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    sourceType: sourceType("source_type").notNull(),
    sourceUrl: text("source_url"),
    storageKey: text("storage_key"),
    contentHash: text("content_hash"),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    fps: real("fps"),
    status: videoStatus("status").notNull().default("pending"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("videos_content_hash_key").on(t.contentHash)],
);

export const stageRuns = pgTable(
  "stage_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    stage: stage("stage").notNull(),
    status: runStatus("status").notNull().default("queued"),
    inputHash: text("input_hash"),
    attempts: integer("attempts").notNull().default(0),
    progress: integer("progress").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("stage_runs_video_stage_key").on(t.videoId, t.stage),
    index("stage_runs_status_idx").on(t.status),
  ],
);
