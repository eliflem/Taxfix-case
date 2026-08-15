// config.json is bundled alongside this function — a JSON snapshot of
// guardrails/config.yaml (guardrails/ remains the single source of truth;
// regenerate this file whenever it changes, see README.md). Imported
// statically (not read at runtime via Deno.readTextFile) so Supabase's
// function bundler reliably includes it as a deployed asset — a runtime
// file read wasn't picked up without Docker available during `deploy`.
import configData from "../config.json" with { type: "json" };

export interface RefuseCategory {
  id: string;
  description: string;
  message: string;
}

export interface Topic {
  id: string;
  description: string;
}

export interface GuardrailConfig {
  version: string;
  tax_year: number;
  persona: string;
  stage_1_safety_gate: {
    hard_refuse_categories: RefuseCategory[];
    soft_redirect_categories: RefuseCategory[];
    decline_and_handoff_topics: Topic[];
  };
  stage_2_confidence_engine: {
    in_scope_topics: Topic[];
    known_gaps: { id: string; topics: string[]; description: string; behavior: string }[];
    thresholds: { answer_min_similarity: number; hedge_min_similarity: number };
    clarify_if_ambiguous: { enabled: boolean; rule: string };
    temporal_scope_check: { rule: string };
    groundedness_check: { enabled: boolean; rule: string };
    handoff_message: string;
    hedge_prefix: string;
    hedge_soft_touch: { enabled: boolean; text: string };
  };
  handoff: { cta_button_label: string; cta_text: string };
  response_behavior: {
    language_matching: { rule: string };
    standing_disclaimer: { text: string };
  };
}

export function loadConfig(): GuardrailConfig {
  return configData as unknown as GuardrailConfig;
}

export function buildCategoryList(config: GuardrailConfig) {
  const hardRefuse = config.stage_1_safety_gate.hard_refuse_categories.map((c) => ({
    id: c.id,
    description: c.description,
    bucket: "hard_refuse" as const,
  }));
  const softRedirect = config.stage_1_safety_gate.soft_redirect_categories.map((c) => ({
    id: c.id,
    description: c.description,
    bucket: "soft_redirect" as const,
  }));
  const declineTopics = config.stage_1_safety_gate.decline_and_handoff_topics.map((t) => ({
    id: t.id,
    description: t.description,
    bucket: "decline_and_handoff" as const,
  }));
  const inScopeTopics = config.stage_2_confidence_engine.in_scope_topics.map((t) => ({
    id: t.id,
    description: t.description,
    bucket: "in_scope" as const,
  }));
  return [...hardRefuse, ...softRedirect, ...declineTopics, ...inScopeTopics];
}
