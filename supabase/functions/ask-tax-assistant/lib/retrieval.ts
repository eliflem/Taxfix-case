import { embedContentSafe } from "./gemini.ts";

// Precomputed corpus embeddings, bundled alongside this function (copied
// from assistant/cache/embeddings.json — regenerate with
// `npm run build-embeddings` in assistant/ and re-copy whenever data/
// changes; this is a deployed snapshot, not computed at request time).
// Statically imported (not Deno.readTextFile) for the same bundling-
// reliability reason as config.ts — see that file's comment.
import embeddingsData from "../embeddings.json" with { type: "json" };

export interface Chunk {
  id: string;
  text: string;
  sourceLabel: string;
  sourceFile: string;
  sourceUrl?: string;
}

interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

interface EmbeddingsCache {
  model: string;
  builtAt: string;
  chunks: EmbeddedChunk[];
}

function loadEmbeddings(): EmbeddingsCache {
  return embeddingsData as unknown as EmbeddingsCache;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface RetrievalResult {
  chunk: Chunk;
  score: number;
}

export async function retrieveTopK(query: string, k = 5): Promise<RetrievalResult[]> {
  const embeddings = loadEmbeddings();
  const [queryEmbedding] = await embedContentSafe([query], "RETRIEVAL_QUERY");
  const scored = embeddings.chunks.map((c) => ({ chunk: c, score: cosineSimilarity(queryEmbedding, c.embedding) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
