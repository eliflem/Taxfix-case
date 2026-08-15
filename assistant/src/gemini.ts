import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL_CACHE_PATH = path.join(__dirname, "..", "cache", "working_models.json");

let client: GoogleGenAI | null = null;

export function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY not set. Create assistant/.env with GEMINI_API_KEY=... " +
        "(never paste the key in chat) and run scripts with --env-file=.env " +
        "(the npm scripts already do this).",
    );
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

// Mirrors scripts/scraper.py's defensive "try candidates" pattern — model
// availability/naming shifts over time, so probe rather than hardcode one
// name. Real finding while building this: gemini-3.6-flash and
// gemini-3.5-flash-lite are newer/paid-tier models that only grant a token
// 20 requests/day allowance on a free-tier key (quota metric literally
// named "...FreeTier" as an anti-abuse allowance, not the real free-tier
// budget). The models Google actually designates for free-tier use
// (2.5-flash-lite, 3-flash, 3.1-flash-lite) have much larger daily
// allowances (250-1500/day) — listed first so we land there before
// touching the paid models' token allowances at all. gemini-2.5-flash
// itself is confirmed deprecated (404, not quota) as of this build.
const GENERATION_MODEL_CANDIDATES = [
  "gemini-2.5-flash-lite",
  "gemini-3-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
];
const EMBEDDING_MODEL_CANDIDATES = ["gemini-embedding-001", "text-embedding-004"];

interface ModelCache {
  generation?: string;
  embedding?: string;
}

function readModelCache(): ModelCache {
  if (!existsSync(MODEL_CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(MODEL_CACHE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeModelCache(update: Partial<ModelCache>) {
  const current = readModelCache();
  writeFileSync(MODEL_CACHE_PATH, JSON.stringify({ ...current, ...update }, null, 2));
}

let workingGenerationModel: string | null = readModelCache().generation ?? null;
let workingEmbeddingModel: string | null = readModelCache().embedding ?? null;

/** Errors worth rotating to the next candidate model for — quota exhaustion
 * OR the model being unavailable/deprecated (404/NOT_FOUND, discovered when
 * gemini-2.5-flash turned out to be deprecated for new users). Anything
 * else (bad request, auth failure) should surface immediately instead of
 * silently retrying against a different model. */
function isRotationWorthy(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("RESOURCE_EXHAUSTED") || msg.includes("429") || msg.includes("NOT_FOUND") || msg.includes("404");
}

/** Per-minute quota errors are worth a short wait-and-retry on the SAME
 * model (the limit resets in seconds) rather than immediately burning
 * through every other candidate's own limit — discovered when a burst of
 * eval calls tripped gemini-3.1-flash-lite's 15-requests/minute cap and the
 * rotation cascaded through every remaining candidate's limit in seconds.
 * Per-DAY quota errors (e.g. gemini-3.6-flash's 20/day) get none of this —
 * waiting won't help within a session, so those should rotate immediately. */
function isPerMinuteQuotaError(err: unknown): { isPerMinute: boolean; retryAfterMs: number } {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes("PerMinute")) return { isPerMinute: false, retryAfterMs: 0 };
  const match = msg.match(/"retryDelay":"(\d+(?:\.\d+)?)s"/);
  const seconds = match ? parseFloat(match[1]) : 15;
  return { isPerMinute: true, retryAfterMs: Math.min(Math.ceil(seconds) * 1000 + 500, 60_000) };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Finds a working model WITHOUT spending a quota-consuming ping call if we
 * already know one from a previous run (persisted to cache/working_models.json). */
export async function findWorkingGenerationModel(): Promise<string> {
  if (workingGenerationModel) return workingGenerationModel;
  const ai = getClient();
  for (const model of GENERATION_MODEL_CANDIDATES) {
    try {
      await ai.models.generateContent({ model, contents: "ping" });
      workingGenerationModel = model;
      writeModelCache({ generation: model });
      return model;
    } catch {
      continue;
    }
  }
  throw new Error(`No working generation model found among: ${GENERATION_MODEL_CANDIDATES.join(", ")}`);
}

export async function findWorkingEmbeddingModel(): Promise<string> {
  if (workingEmbeddingModel) return workingEmbeddingModel;
  const ai = getClient();
  for (const model of EMBEDDING_MODEL_CANDIDATES) {
    try {
      await ai.models.embedContent({ model, contents: ["ping"] });
      workingEmbeddingModel = model;
      writeModelCache({ embedding: model });
      return model;
    } catch {
      continue;
    }
  }
  throw new Error(`No working embedding model found among: ${EMBEDDING_MODEL_CANDIDATES.join(", ")}`);
}

/** generateContent with automatic rotation to the next candidate model on a
 * quota (429) error — the actual request is retried, not just re-pinged. */
export async function generateContentSafe(
  params: Omit<GenerateContentParameters, "model">,
): Promise<GenerateContentResponse> {
  const ai = getClient();
  let model = await findWorkingGenerationModel();
  const startIndex = GENERATION_MODEL_CANDIDATES.indexOf(model);
  const rotation = [
    ...GENERATION_MODEL_CANDIDATES.slice(startIndex),
    ...GENERATION_MODEL_CANDIDATES.slice(0, startIndex),
  ];

  let lastErr: unknown;
  for (const candidate of rotation) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await ai.models.generateContent({ ...params, model: candidate });
        if (candidate !== workingGenerationModel) {
          workingGenerationModel = candidate;
          writeModelCache({ generation: candidate });
        }
        return res;
      } catch (err) {
        lastErr = err;
        const perMinute = isPerMinuteQuotaError(err);
        if (perMinute.isPerMinute && attempt === 0) {
          console.warn(`  (${candidate} hit its per-minute limit, waiting ${(perMinute.retryAfterMs / 1000).toFixed(0)}s...)`);
          await sleep(perMinute.retryAfterMs);
          continue; // retry same candidate once
        }
        if (!isRotationWorthy(err)) throw err;
        console.warn(`  (${candidate} unavailable/exhausted, trying next model...)`);
        break; // move to next candidate
      }
    }
  }
  throw lastErr;
}
