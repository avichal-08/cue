import { defineConfig } from "drizzle-kit";
import { env } from "@cue/core";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { url: env().DATABASE_URL },
});
