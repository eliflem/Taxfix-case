import { generateContentSafe } from "./gemini.ts";
import { loadConfig } from "./config.ts";
import type { RetrievalResult } from "./embeddings.ts";
import type { Tier } from "./stage2.ts";

export interface GeneratedAnswer {
  text: string;
  citations: string[];
}

export async function generateAnswer(
  query: string,
  tier: Extract<Tier, "answer" | "hedge">,
  results: RetrievalResult[],
  topic: string | null = null,
): Promise<GeneratedAnswer> {
  const config = loadConfig();

  const context = results
    .map((r, i) => `[Source ${i + 1}: ${r.chunk.sourceLabel}]\n${r.chunk.text}`)
    .join("\n\n");

  const tierInstruction =
    tier === "hedge"
      ? `This is a HEDGE-tier answer. Open with a version of: "${config.stage_2_confidence_engine.hedge_prefix.trim()}" adapted naturally to the question. Explicitly flag which parts of your answer depend on the user's specific numbers/situation. Close with a version of: "${config.stage_2_confidence_engine.hedge_soft_touch.text.trim()}"`
      : `This is a direct ANSWER-tier response. Answer confidently and directly — the sources fully support it.`;

  // Only include a known gap when it's relevant to the classified topic —
  // injecting it unconditionally leaked unrelated figures (e.g. the €800
  // GWG threshold into home-office answers) and tripped groundedness checks.
  const knownGaps = (config.stage_2_confidence_engine.known_gaps ?? []).filter(
    (g) => topic && g.topics.includes(topic),
  );
  const knownGapsBlock = knownGaps.length
    ? `\nKnown limitations of your knowledge base — apply these behaviors if relevant to this question, even though they may not be tier-obvious from the question alone:\n${knownGaps.map((g) => `- ${g.description.trim()} Behavior: ${g.behavior.trim()}`).join("\n")}\n`
    : "";

  const prompt = `You are a tax assistant for self-employed people in Germany (persona: ${config.persona}, tax year ${config.tax_year}).

Answer the user's question using ONLY the source excerpts below. Do not use any outside knowledge, and do not state any number, rate, or threshold that is not explicitly present in these excerpts.

${context}
${knownGapsBlock}
${tierInstruction}

Cite which source(s) you used inline (e.g. "per EStG §4 Abs. 5" or "per the Taxfix guide on X").

CRITICAL: Respond in the SAME LANGUAGE the user's question is written in. If they asked in English, answer in English. If German, answer in German. Never default to a different language than the question.

User's question: "${query}"`;

  const res = await generateContentSafe({ contents: prompt, config: { temperature: 0.2 } });
  const text = res.text ?? "";
  return { text, citations: results.map((r) => r.chunk.sourceLabel) };
}

/** Cheap heuristic — no API call — to guess whether text is already in
 * English, so localizeMessage() can skip the (quota-costing) translation
 * call for the common case. False negatives just mean an unnecessary but
 * harmless translation call; false positives (skipping a real translation)
 * are the risk, mitigated by checking for German-specific signals rather
 * than assuming English by default. */
function looksEnglish(text: string): boolean {
  const germanSignals = /[äöüßÄÖÜ]|\b(ich|und|der|die|das|nicht|für|mit|kann|habe|ist|eine|einen|wie|was|wo|wenn|Steuer|Kleinunternehmer|Firmenwagen|Gewerbe)\b/i;
  return !germanSignals.test(text);
}

/** Adapts a canned (English) guardrail message to the user's question
 * language. Deliberate fix for the exact bug observed in Taxfix's own
 * assistant (replied in German to an English question) — see
 * guardrails/policy.md "Cross-cutting: language matching". */
export async function localizeMessage(message: string, query: string): Promise<string> {
  if (looksEnglish(query)) return message;

  const prompt = `Rewrite the following message in the same language as the user's question below. Keep the meaning, tone, and length exactly the same — this is a translation/adaptation task, not a rewrite of content. If the question is already in English, return the message unchanged.

Message: "${message}"

User's question: "${query}"

Respond with ONLY the adapted message, nothing else.`;
  const res = await generateContentSafe({ contents: prompt, config: { temperature: 0 } });
  return (res.text ?? message).trim();
}
