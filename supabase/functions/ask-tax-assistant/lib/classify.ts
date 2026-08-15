import { Type } from "npm:@google/genai@1.52.0";
import { generateContentSafe } from "./gemini.ts";
import { loadConfig, buildCategoryList } from "./config.ts";

export type ClassificationBucket =
  | "hard_refuse"
  | "soft_redirect"
  | "decline_and_handoff"
  | "in_scope"
  | "unclear";

export interface ClassificationResult {
  bucket: ClassificationBucket;
  categoryId: string | null;
  reasoning: string;
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    bucket: {
      type: Type.STRING,
      enum: ["hard_refuse", "soft_redirect", "decline_and_handoff", "in_scope", "unclear"],
    },
    categoryId: {
      type: Type.STRING,
      description: "The specific category/topic id from the list, or null if bucket is 'unclear'",
      nullable: true,
    },
    reasoning: { type: Type.STRING, description: "One sentence explaining the classification" },
  },
  required: ["bucket", "categoryId", "reasoning"],
};

async function buildClassifierPrompt(query: string): Promise<string> {
  const config = await loadConfig();
  const categories = buildCategoryList(config);

  const byBucket = (bucket: string) =>
    categories
      .filter((c) => c.bucket === bucket)
      .map((c) => `  - ${c.id}: ${c.description}`)
      .join("\n");

  return `You are the routing classifier for a tax assistant scoped to self-employed people in Germany (persona: ${config.persona}).

Classify the user's message into exactly ONE of these buckets, and the specific category id within it.

BUCKET "hard_refuse" — the request itself is illegitimate:
${byBucket("hard_refuse")}

BUCKET "soft_redirect" — legitimate but not a tax question:
${byBucket("soft_redirect")}

BUCKET "decline_and_handoff" — a real, legitimate tax question, but on a topic this assistant's knowledge base does not cover:
${byBucket("decline_and_handoff")}

BUCKET "in_scope" — a real tax question this assistant's knowledge base is built to answer:
${byBucket("in_scope")}

BUCKET "unclear" — the message is too vague/ambiguous to classify confidently. Use categoryId: null for this bucket. This includes:
  - No concrete question, or it plausibly spans multiple unrelated categories with no way to tell which was meant (e.g. "I have several questions about X" with no specifics given).
  - The asker's own description suggests they may not actually be self-employed AT ALL — e.g. they mention a "full-time job" or being an "employee" and describe NO self-employment/freelance/business activity of their own anywhere in the message. This assistant's knowledge base is scoped to self-employed filers; employee expense rules are legally different (different EStG section) even when the topic sounds the same (e.g. home office). Don't guess which situation applies — ask.
    IMPORTANT: this does NOT apply when the asker clearly describes running their own business/freelance/Kleinunternehmer activity ALONGSIDE a job — that's not ambiguous about whether they're self-employed (they clearly are, partly), it's a real in-scope-adjacent question about combining income types. Only use "unclear" here when self-employment is absent entirely, not merely when a job is also mentioned.

Rules:
- Classify by TOPIC, never by the asker's business-structure identity. If someone describes themselves as Kleingewerbe, Einzelunternehmer, or Gewerbe (rather than Freiberufler) and asks about a topic whose underlying rule doesn't depend on that distinction (e.g. home office, VAT rates, GWG equipment threshold, gifts/meals), classify it in_scope exactly as you would for a Freiberufler asker. Only route to decline_and_handoff on trade_tax_gewerbesteuer or entity_structuring grounds if the question is actually ABOUT trade tax or business structure — not merely because the asker mentioned a non-Freiberufler business type in passing.
- Pick the single best-fitting category. If a message could span an in_scope topic AND a decline_and_handoff topic (e.g. asks about VAT rates AND about cross-border sales), classify by the PRIMARY intent of the question — if the primary intent is answerable and the secondary aspect is a minor add-on, prefer in_scope.
- Do not answer the question. Only classify it.
- If the message is clearly about self-employment taxes in Germany but doesn't cleanly match any listed category, use bucket "unclear".

User message: "${query}"

Respond with JSON matching the schema.`;
}

export async function classify(query: string): Promise<ClassificationResult> {
  const prompt = await buildClassifierPrompt(query);

  const res = await generateContentSafe({
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  const text = res.text;
  if (!text) throw new Error("Classifier returned no text");
  return JSON.parse(text) as ClassificationResult;
}
