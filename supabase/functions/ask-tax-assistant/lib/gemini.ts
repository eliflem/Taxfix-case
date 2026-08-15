import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "npm:@google/genai@1.52.0";

let client: GoogleGenAI | null = null;

export function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set as a Supabase secret for this function.");
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

// Same real-world finding as assistant/src/gemini.ts (the Node CLI
// prototype this was ported from): gemini-3.6-flash/3.5-flash-lite are
// newer/paid-tier-adjacent models with only a token free allowance;
// 2.5-flash-lite/3-flash/3.1-flash-lite are the models actually designated
// for free-tier use, with much larger per-minute allowances. No persistent
// "last known working model" cache here (unlike the Node CLI version) —
// serverless invocations don't reliably share a filesystem across cold
// starts, so each request just tries candidates in order and rotates on
// failure rather than reading a cached choice.
const GENERATION_MODEL_CANDIDATES = [
  "gemini-2.5-flash-lite",
  "gemini-3-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
];
const EMBEDDING_MODEL_CANDIDATES = ["gemini-embedding-001", "text-embedding-004"];

function isRotationWorthy(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429") || msg.includes("NOT_FOUND") || msg.includes("404");
}

function isPerMinuteQuotaError(err: unknown): { isPerMinute: boolean; retryAfterMs: number } {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes("PerMinute")) return { isPerMinute: false, retryAfterMs: 0 };
  const match = msg.match(/"retryDelay":"(\d+(?:\.\d+)?)s"/);
  const seconds = match ? parseFloat(match[1]) : 15;
  return { isPerMinute: true, retryAfterMs: Math.min(Math.ceil(seconds) * 1000 + 500, 20_000) }; // capped lower than the CLI version — a live chat request shouldn't hang 60s
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateContentSafe(
  params: Omit<GenerateContentParameters, "model">,
): Promise<GenerateContentResponse> {
  const ai = getClient();
  let lastErr: unknown;
  for (const candidate of GENERATION_MODEL_CANDIDATES) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await ai.models.generateContent({ ...params, model: candidate });
      } catch (err) {
        lastErr = err;
        const perMinute = isPerMinuteQuotaError(err);
        if (perMinute.isPerMinute && attempt === 0) {
          await sleep(perMinute.retryAfterMs);
          continue;
        }
        if (!isRotationWorthy(err)) throw err;
        break;
      }
    }
  }
  throw lastErr;
}

export async function embedContentSafe(texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  const ai = getClient();
  let lastErr: unknown;
  for (const candidate of EMBEDDING_MODEL_CANDIDATES) {
    try {
      const res = await ai.models.embedContent({
        model: candidate,
        contents: texts,
        config: { taskType, outputDimensionality: 768 },
      });
      if (!res.embeddings) throw new Error("No embeddings returned");
      return res.embeddings.map((e) => {
        if (!e.values) throw new Error("Embedding missing values");
        return e.values;
      });
    } catch (err) {
      lastErr = err;
      if (!isRotationWorthy(err)) throw err;
      continue;
    }
  }
  throw lastErr;
}
