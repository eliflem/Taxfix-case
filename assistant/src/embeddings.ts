import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getClient, findWorkingEmbeddingModel } from "./gemini.ts";
import { loadCorpus, type Chunk } from "./corpus.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, "..", "cache", "embeddings.json");

export interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

interface Cache {
  model: string;
  builtAt: string;
  chunks: EmbeddedChunk[];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Gemini's embed endpoint takes one taskType per call but accepts a batch of
 * texts, so we chunk the corpus into batches rather than one call per chunk. */
async function embedBatch(model: string, texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  const ai = getClient();
  const BATCH_SIZE = 20;
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await ai.models.embedContent({
      model,
      contents: batch,
      config: { taskType, outputDimensionality: 768 },
    });
    if (!res.embeddings) throw new Error("No embeddings returned from Gemini");
    for (const e of res.embeddings) {
      if (!e.values) throw new Error("Embedding missing values");
      results.push(e.values);
    }
  }
  return results;
}

export async function buildEmbeddingsCache(): Promise<void> {
  const chunks = loadCorpus();
  const model = await findWorkingEmbeddingModel();
  console.log(`Embedding ${chunks.length} chunks with model "${model}"...`);
  const vectors = await embedBatch(model, chunks.map((c) => c.text), "RETRIEVAL_DOCUMENT");
  const embeddedChunks: EmbeddedChunk[] = chunks.map((c, i) => ({ ...c, embedding: vectors[i] }));
  const cache: Cache = { model, builtAt: new Date().toISOString(), chunks: embeddedChunks };
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
  console.log(`Wrote embeddings cache to ${CACHE_PATH}`);
}

export function loadEmbeddingsCache(): Cache {
  if (!existsSync(CACHE_PATH)) {
    throw new Error(`No embeddings cache at ${CACHE_PATH}. Run "npm run build-embeddings" first.`);
  }
  return JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
}

export interface RetrievalResult {
  chunk: Chunk;
  score: number;
}

export async function retrieveTopK(query: string, k = 5): Promise<RetrievalResult[]> {
  const cache = loadEmbeddingsCache();
  const [queryEmbedding] = await embedBatch(cache.model, [query], "RETRIEVAL_QUERY");
  const scored = cache.chunks.map((c) => ({ chunk: c, score: cosineSimilarity(queryEmbedding, c.embedding) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
