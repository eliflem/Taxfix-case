import { loadConfig } from "./config.ts";
import { retrieveTopK, type RetrievalResult } from "./embeddings.ts";

export type Tier = "clarify" | "answer" | "hedge" | "decline";

export interface Stage2Result {
  tier: Tier;
  topResults: RetrievalResult[];
  topScore: number;
  reason: string;
}

/** Ambiguous if the top match is weak AND the #2 match is a close competitor
 * from a meaningfully different part of the corpus — i.e. no clear winner. */
function looksAmbiguous(results: RetrievalResult[]): boolean {
  if (results.length < 2) return false;
  const [first, second] = results;
  const scoreGap = first.score - second.score;
  const differentSource = first.chunk.sourceLabel !== second.chunk.sourceLabel;
  return first.score < 0.6 && scoreGap < 0.03 && differentSource;
}

export async function runStage2(query: string): Promise<Stage2Result> {
  const config = loadConfig();
  const { answer_min_similarity, hedge_min_similarity } = config.stage_2_confidence_engine.thresholds;

  const topResults = await retrieveTopK(query, 5);
  const topScore = topResults[0]?.score ?? 0;

  if (config.stage_2_confidence_engine.clarify_if_ambiguous.enabled && looksAmbiguous(topResults)) {
    return { tier: "clarify", topResults, topScore, reason: "Top retrieval matches are weak and ambiguous across sources" };
  }

  if (topScore >= answer_min_similarity) {
    return { tier: "answer", topResults, topScore, reason: `Top score ${topScore.toFixed(3)} >= answer threshold` };
  }
  if (topScore >= hedge_min_similarity) {
    return { tier: "hedge", topResults, topScore, reason: `Top score ${topScore.toFixed(3)} in hedge band` };
  }
  return { tier: "decline", topResults, topScore, reason: `Top score ${topScore.toFixed(3)} below hedge threshold` };
}

/** Heuristic groundedness check: every number/rate/€ amount in the drafted
 * answer must appear in the retrieved context. Cheap and deterministic
 * rather than a second LLM call — good enough to catch invented figures. */
export function checkGroundedness(answerText: string, retrievedContext: string): { grounded: boolean; ungroundedNumbers: string[] } {
  const numberPattern = /€\s?[\d.,]+|[\d.,]+\s?(?:%|Euro|EUR|€)|\b\d{2,}\b/g;
  const answerNumbers = [...new Set(answerText.match(numberPattern) ?? [])];
  const normalize = (s: string) => s.replace(/[^\d]/g, "");
  const contextNormalized = normalize(retrievedContext);

  const ungrounded = answerNumbers.filter((n) => {
    const digits = normalize(n);
    if (digits.length === 0) return false;
    return !contextNormalized.includes(digits);
  });

  return { grounded: ungrounded.length === 0, ungroundedNumbers: ungrounded };
}

export function downgradeTier(tier: Tier): Tier {
  if (tier === "answer") return "hedge";
  if (tier === "hedge") return "decline";
  return tier;
}

export function checkTemporalScope(query: string): { flagged: boolean; note?: string } {
  const config = loadConfig();
  const yearMatch = query.match(/\b(20\d{2})\b/);
  if (!yearMatch) return { flagged: false };
  const year = parseInt(yearMatch[1], 10);
  if (year !== config.tax_year) {
    return {
      flagged: true,
      note: `Question references ${year}, but this assistant's knowledge base is anchored to tax year ${config.tax_year}.`,
    };
  }
  return { flagged: false };
}
