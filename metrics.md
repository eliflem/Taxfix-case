# Metrics — how we'd know this is working

Two layers, and they shouldn't be confused: what we can measure **today**,
offline, against the 21-question golden set (`assistant/eval/golden.json`)
with the eval harness already built — and what would need **production
instrumentation** we haven't built, because it wasn't necessary to prove
the concept in a v1 prototype. Being explicit about that split is itself
the "buildable now vs. not" answer for this part of the system.

## The one-sentence answer

**Safe deflection rate** — the share of real questions we resolve directly
(answer or hedge, not a refusal) with zero factually incorrect claims,
without a human ever getting involved. It's the one number that captures
both halves of the brief at once: "answers well enough to act on with
confidence" (deflection) and "catch it when it's confidently wrong" (safe).
Optimize deflection alone and the assistant gets reckless; optimize safety
alone and it declines everything — the guardrail tiers exist specifically
to trade these off deliberately rather than by accident.

## Measured today, offline (real numbers, `assistant/eval/`)

| Metric | Definition | Current value |
|---|---|---|
| **Tier-match accuracy** | % of golden-set questions where the pipeline's actual tier equals the expected tier | 67–76% across runs (varies — see "non-determinism" below) |
| **Content-safety rate** | % of eval responses where manual review found no factually incorrect or unsafe claim, *regardless of whether the tier label matched* | **100%** (0 of 21 questions produced unsafe content on manual review — every tier "mismatch" was either over-cautious or a defensible alternative classification, never a wrong fact reaching the user) |
| **Groundedness pass rate** | % of answer/hedge responses that pass the automated groundedness check (every stated number traces to a retrieved source) on the first generation attempt | Tracked per-request via `checkGroundedness()`; not yet aggregated across a large sample — worth doing once real usage exists |
| **Hard-refuse recall** | % of adversarial test cases (fraud framing, prompt injection) correctly refused | 100% (2/2 tested cases) — small sample, worth expanding |
| **Response latency** | Wall-clock time per question, full pipeline (classify → retrieve → generate) | Median **2.0s**, typical range 0.8–5.8s. One real outlier at 25.6s from a per-minute quota wait-retry (see `guardrails/policy.md` eval-results section) — a real tail-latency case worth knowing about, not hidden |
| **Language-match correctness** | % of responses in the same language as the question | 100% in testing — verified live (German company-car question → German decline response, both locally and in the deployed Lovable demo) |

**Tier-match accuracy is the weakest of these numbers on purpose** — it's
the only one that treats "answered correctly but I'd labeled it hedge" the
same as "gave a wrong fact." Content-safety rate is the metric that
actually matters for a legal/financial assistant, and it's the stronger
number precisely because it required manually reading every failure rather
than trusting a label match.

**Non-determinism, stated plainly**: even at `temperature: 0`, the
classifier isn't perfectly consistent on genuinely borderline questions
(confirmed directly — one eval question flipped classification across
otherwise-identical runs). This is a real property of LLM-based
classification, not a bug to hide. It's part of why content-safety rate
matters more than tier accuracy: the content stayed safe across every
observed variation, even when the tier didn't.

## Would need production instrumentation (not built in v1, and why)

| Metric | Definition | Why it's not measurable yet |
|---|---|---|
| **Handoff-to-booking conversion rate** | % of decline/handoff responses where the user actually completes a session with a human tax expert | The "Talk to a tax expert" CTA renders correctly (verified live), but nothing logs whether it's clicked or what happens after — that's a product analytics integration, deliberately out of scope for a stateless v1 prototype with no database |
| **Real deflection rate** | % of *actual* user questions (not our curated 21) resolved without human handoff | Our golden set was built for topic *coverage*, not representative question *frequency* — a real rate needs production traffic, not a hand-picked eval set. (For reference, the golden set's own tier split, `answer:9 clarify:2 decline:8 hedge:1 redirect:1` in the latest run, is a coverage sample, not a usage estimate.) |
| **Helpful/Not-helpful rate** | % of responses users mark helpful | The UI buttons exist (visible in every Lovable screenshot) but aren't wired to persistence — logging them means adding a database table, which we deliberately didn't do to keep the edge function stateless for v1 |
| **Groundedness rate at scale** | Groundedness pass rate over thousands of real requests, not 21 eval questions | Needs real traffic + logging infrastructure, not a code change — the check itself already runs on every request, it's just not aggregated anywhere yet |

None of these are hard to add later — they're mostly "add a Supabase table
and log an event," not a redesign. They're absent because a v1 prototype
built in ~2 days didn't need a database to prove the concept, not because
we didn't think of them. The `handoff-to-booking conversion rate` was
flagged as a candidate metric in `guardrails/config.yaml` from the moment
the handoff CTA was designed — this file is that flag finally getting a
real definition.

## How we'd catch it being confidently wrong

Three layers, from cheapest/fastest to most thorough:

1. **Automated groundedness check** (`stage2.ts` → `checkGroundedness()`) —
   runs on every single request, no sampling. Extracts every number/rate
   from the drafted answer and confirms it appears in the retrieved source
   text; if not, the tier downgrades automatically (answer → hedge → decline)
   before the user ever sees it. Cheap, deterministic, no extra API call.
2. **Golden-set regression testing** (`npm run eval` in `assistant/`) — the
   21-question set with expected tiers, designed to be re-run any time
   `data/`, `guardrails/config.yaml`, or the generation/classification
   prompts change. This is exactly what caught the real bugs documented in
   `guardrails/policy.md` (the persona-based misclassification, the
   trade-tax corpus leak) — it's a regression suite now, not a one-time
   test.
3. **Manual content review** — the level above tier-matching. Every eval
   "failure" gets read, not just counted, specifically to catch the case
   tier accuracy can't: a correctly-labeled tier with subtly wrong content.
   This is what produced the 100% content-safety rate above — it's a
   human-review step precisely because we don't yet trust an automated
   check to be the final word on factual correctness for something with
   real financial consequences.

In production, layer 3 doesn't scale to reading every response — it would
become spot-check sampling plus the "Not helpful" signal (once wired to
persistence) as the trigger for what to sample.
