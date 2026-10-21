import express from "express";
import { env } from "@cue/core";
import { health } from "./routes/health";
import { jobs } from "./routes/jobs";
import { search } from "./routes/search";
import { videos } from "./routes/videos";

const app = express();
app.use(express.json());

app.use("/health", health);
app.use("/videos", videos);
app.use("/jobs", jobs);
app.use("/search", search);

const port = env().API_PORT;
app.listen(port, () => console.log(`api listening on :${port}`));
