import { ask } from "./pipeline.ts";

const query = process.argv.slice(2).join(" ").trim();

if (!query) {
  console.error('Usage: npm run ask "your question here"');
  process.exit(1);
}

const t0 = Date.now();
const res = await ask(query);
const ms = Date.now() - t0;

console.log(`\n[${res.tier}]  (${ms}ms, classified as ${res.debug.classification.bucket}/${res.debug.classification.categoryId ?? "-"}${res.debug.stage2 ? `, retrieval top score ${res.debug.stage2.topScore.toFixed(3)}` : ""}${res.debug.groundednessDowngraded ? ", GROUNDEDNESS DOWNGRADE" : ""})`);
console.log(res.message);
if (res.citations.length) {
  console.log("\nCited:", res.citations.join(" | "));
}
