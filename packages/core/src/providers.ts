export interface Word {
  word: string;
  startMs: number;
  endMs: number;
  confidence?: number;
}

export interface Transcript {
  text: string;
  language?: string;
  words: Word[];
}

export interface ModelInfo {
  id: string;
}

export interface SpeechToText extends ModelInfo {
  transcribe(audio: Buffer, mimeType: string): Promise<Transcript>;
}

export interface TextEmbedder extends ModelInfo {
  dims: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface ImageEmbedder extends ModelInfo {
  dims: number;
  embedImages(images: Buffer[]): Promise<number[][]>;
  embedText(texts: string[]): Promise<number[][]>;
}

export interface OcrBlock {
  text: string;
  confidence?: number;
}

export interface Ocr extends ModelInfo {
  read(image: Buffer): Promise<OcrBlock[]>;
}

export interface RerankCandidate {
  id: string;
  text: string;
  image?: Buffer;
}

export interface RerankResult {
  id: string;
  score: number;
  reason?: string;
}

export interface Reranker extends ModelInfo {
  rerank(query: string, candidates: RerankCandidate[], topK: number): Promise<RerankResult[]>;
}

export interface AnswerSource {
  videoId: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface Answer {
  text: string;
  citations: AnswerSource[];
}

export interface Answerer extends ModelInfo {
  answer(query: string, sources: AnswerSource[]): Promise<Answer>;
}

export interface Providers {
  stt: SpeechToText;
  textEmbedder: TextEmbedder;
  imageEmbedder: ImageEmbedder;
  ocr: Ocr;
  reranker: Reranker;
  answerer: Answerer;
}

let registered: Providers | undefined;

export function registerProviders(p: Providers): void {
  registered = p;
}

export function providers(): Providers {
  if (!registered) throw new Error('providers not registered');
  return registered;
}
