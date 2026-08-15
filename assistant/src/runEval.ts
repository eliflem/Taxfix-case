import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ask } from "./pipeline.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = path.join(__dirname, "..", "eval", "golden.json");
const RESULTS_PATH = path.join(__dirname, "..", "eval", "results.json");

interface GoldenItem {
  id: string;
  question: string;
  expectedTier: "answer" | "hedge" | "clarify" | "decline" | "soft_redirect" | "hard_refuse";
  topic: string;
  source: string;
}

// Pipeline can emit "decline_and_handoff" (stage 1, topic-based) or
// "decline" (stage 2, low retrieval score) — both count as a match for
// expectedTier "decline" since they're the same user-facing behavior.
function tierMatches(expected: string, actual: string): boolean {
  if (expected === "decline") return actual === "decline" || actual === "decline_and_handoff";
  return expected === actual;
}

async function main() {
  const golden: GoldenItem[] = JSON.parse(readFileSync(GOLDEN_PATH, "utf-8"));
  const results: any[] = [];

  for (const [i, item] of golden.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 2000)); // light pacing to avoid tripping per-minute quotas
    process.stdout.write(`[${i + 1}/${golden.length}] ${item.id}... `);
    const t0 = Date.now();
    try {
      const res = await ask(item.question);
      const ms = Date.now() - t0;
      const match = tierMatches(item.expectedTier, res.tier);
      console.log(`${match ? "PASS" : "FAIL"} — expected ${item.expectedTier}, got ${res.tier} (${ms}ms)`);
      results.push({
        id: item.id,
        question: item.question,
        expectedTier: item.expectedTier,
        actualTier: res.tier,
        match,
        classification: res.debug.classification,
        topScore: res.debug.stage2?.topScore ?? null,
        groundednessDowngraded: res.debug.groundednessDowngraded ?? false,
        ms,
        message: res.message,
      });
    } catch (err: any) {
      console.log(`ERROR — ${err.message}`);
      results.push({ id: item.id, question: item.question, expectedTier: item.expectedTier, error: err.message });
    }
  }

  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));

  const passed = results.filter((r) => r.match).length;
  const total = results.length;
  console.log(`\n=== ${passed}/${total} passed (${((passed / total) * 100).toFixed(0)}%) ===`);

  console.log("\n--- Retrieval score distribution (in-scope items only) ---");
  const scored = results.filter((r) => r.topScore != null).sort((a, b) => b.topScore - a.topScore);
  for (const r of scored) {
    console.log(`${r.topScore.toFixed(3)}  expected=${r.expectedTier.padEnd(8)} actual=${r.actualTier.padEnd(20)} ${r.match ? "OK" : "MISMATCH"}  ${r.id}`);
  }

  console.log("\n--- Failures ---");
  for (const r of results.filter((r) => !r.match)) {
    console.log(`${r.id}: expected ${r.expectedTier}, got ${r.actualTier ?? r.error} — "${r.question.slice(0, 70)}"`);
  }
}

main();
