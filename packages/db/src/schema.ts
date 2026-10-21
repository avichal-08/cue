import { sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
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

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const segments = pgTable(
  "segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    keyframeKey: text("keyframe_key"),
    transcriptText: text("transcript_text"),
    ocrText: text("ocr_text"),
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(transcript_text, '') || ' ' || coalesce(ocr_text, ''))`,
    ),
    textEmbedding: vector("text_embedding", { dimensions: 1536 }),
    visualEmbedding: vector("visual_embedding", { dimensions: 1024 }),
    ocrEmbedding: vector("ocr_embedding", { dimensions: 1536 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("segments_video_idx_key").on(t.videoId, t.idx),
    index("segments_search_tsv_idx").using("gin", t.searchTsv),
    index("segments_text_embedding_idx").using("hnsw", t.textEmbedding.op("vector_cosine_ops")),
    index("segments_visual_embedding_idx").using("hnsw", t.visualEmbedding.op("vector_cosine_ops")),
    index("segments_ocr_embedding_idx").using("hnsw", t.ocrEmbedding.op("vector_cosine_ops")),
  ],
);
