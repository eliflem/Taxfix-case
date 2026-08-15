import { loadConfig } from "./config.ts";
import { classify } from "./classify.ts";
import { runStage2, checkGroundedness, checkTemporalScope, downgradeTier, type Tier } from "./stage2.ts";
import { generateAnswer, localizeMessage } from "./generate.ts";

export type ResponseTier = "hard_refuse" | "soft_redirect" | "decline_and_handoff" | "clarify" | "answer" | "hedge" | "decline";

export interface AssistantResponse {
  tier: ResponseTier;
  message: string;
  citations: string[];
  debug: {
    classification: Awaited<ReturnType<typeof classify>>;
    stage2?: Awaited<ReturnType<typeof runStage2>>;
    groundednessDowngraded?: boolean;
    temporalFlag?: string;
  };
}

function findCategory(id: string | null, list: { id: string; message?: string }[]) {
  return list.find((c) => c.id === id);
}

export async function ask(query: string): Promise<AssistantResponse> {
  const config = loadConfig();
  const classification = await classify(query);

  // --- Stage 1 outcomes ---
  if (classification.bucket === "hard_refuse") {
    const cat = findCategory(classification.categoryId, config.stage_1_safety_gate.hard_refuse_categories);
    const message = await localizeMessage(cat?.message ?? "I can't help with that.", query);
    return { tier: "hard_refuse", message, citations: [], debug: { classification } };
  }

  if (classification.bucket === "soft_redirect") {
    const cat = findCategory(classification.categoryId, config.stage_1_safety_gate.soft_redirect_categories);
    const message = await localizeMessage(cat?.message ?? "I'm built for self-employed tax questions in Germany.", query);
    return { tier: "soft_redirect", message, citations: [], debug: { classification } };
  }

  if (classification.bucket === "decline_and_handoff") {
    const base = `${config.stage_2_confidence_engine.handoff_message.trim()} ${config.handoff.cta_text.trim()}`;
    const message = await localizeMessage(base, query);
    return { tier: "decline_and_handoff", message, citations: [], debug: { classification } };
  }

  if (classification.bucket === "unclear") {
    const message = await localizeMessage(
      "Could you say a bit more about what you're asking? I want to make sure I point you to the right answer rather than guess.",
      query,
    );
    return { tier: "clarify", message, citations: [], debug: { classification } };
  }

  // --- classification.bucket === "in_scope": run stage 2 ---
  const temporal = checkTemporalScope(query);
  const stage2 = await runStage2(query);

  if (stage2.tier === "clarify") {
    const message = await localizeMessage(
      "Could you give me a bit more detail? I want to point you to the right answer rather than guess.",
      query,
    );
    return { tier: "clarify", message, citations: [], debug: { classification, stage2 } };
  }

  if (stage2.tier === "decline") {
    const base = `${config.stage_2_confidence_engine.handoff_message.trim()} ${config.handoff.cta_text.trim()}`;
    const message = await localizeMessage(base, query);
    return { tier: "decline", message, citations: [], debug: { classification, stage2 } };
  }

  // stage2.tier is "answer" or "hedge"
  let tier: Tier = stage2.tier;
  let generated = await generateAnswer(query, tier as "answer" | "hedge", stage2.topResults, classification.categoryId);
  let downgraded = false;

  if (config.stage_2_confidence_engine.groundedness_check.enabled) {
    const context = stage2.topResults.map((r) => r.chunk.text).join(" ");
    const check = checkGroundedness(generated.text, context);
    if (!check.grounded) {
      downgraded = true;
      const newTier = downgradeTier(tier);
      if (newTier === "decline") {
        const base = `${config.stage_2_confidence_engine.handoff_message.trim()} ${config.handoff.cta_text.trim()}`;
        const message = await localizeMessage(base, query);
        return {
          tier: "decline",
          message,
          citations: [],
          debug: { classification, stage2, groundednessDowngraded: true },
        };
      }
      tier = newTier;
      generated = await generateAnswer(query, tier as "answer" | "hedge", stage2.topResults, classification.categoryId);
    }
  }

  let message = generated.text;
  if (temporal.flagged && temporal.note) {
    message = `${temporal.note}\n\n${message}`;
  }

  return {
    tier,
    message,
    citations: generated.citations,
    debug: { classification, stage2, groundednessDowngraded: downgraded, temporalFlag: temporal.note },
  };
}
