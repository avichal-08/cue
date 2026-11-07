import express from 'express';
import { env } from '@cue/core';
import { cors } from './cors';
import { errorHandler } from './errors';
import { events } from './routes/events';
import { health } from './routes/health';
import { jobs } from './routes/jobs';
import { search } from './routes/search';
import { videos } from './routes/videos';
import { timing } from './timing';

const app = express();
app.use(timing);
app.use(cors(env().WEB_ORIGIN));
app.use(express.json());

app.use('/health', health);
app.use('/videos', videos);
app.use('/events', events);
app.use('/jobs', jobs);
app.use('/search', search);
app.use(errorHandler);

const port = env().API_PORT;
app.listen(port, () => console.log(`api listening on :${port}`));
