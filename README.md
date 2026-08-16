# AI Tax Assistant for Self-Employed Filers

An AI assistant for self-employed users filing taxes in Germany — built,
tested, and deployed as a working prototype, not a concept. Taxfix AI PM
Builder case study, self-employed track.

**Live demo:** [https://taxfix-chat-clone.lovable.app/] — the frontend lives in a
separate repo (Lovable auto-creates its own on connect); this repo is the
source of truth for the assistant logic, guardrails, data, and evaluation
work behind it.


## Try it

Ask it something in-scope (e.g. *"Can I deduct my home office as a
freelancer?"*), something that needs a caveat (*"Can I deduct a €1,500
laptop?"*), or something it should decline (*"I bought a car for business
use, can I deduct tax?"*) — see [`problem_framing.md`](problem_framing.md)
for where these questions actually came from, and
[`research/user_questions.md`](research/user_questions.md) for the full
set.

## What this is

Self-employed Taxfix users hit tax questions the product doesn't answer
well today, and guess, give up, or wait for a human expert. This is a
retrieval-grounded assistant scoped to one persona — Freiberufler,
first-time or early filer in Germany — that answers directly when it has
solid grounding, hedges and flags what depends on the user's own numbers
when it doesn't, and hands off to a human expert (framed as a product
opportunity, not an apology) when a question is genuinely out of scope.
Full reasoning in [`problem_framing.md`](problem_framing.md) and
[`guardrails/policy.md`](guardrails/policy.md).

## Repo map

| Path | What's there |
|---|---|
| [`data/`](data/) | The knowledge base — Taxfix's own scraped info-guide content plus six sections of German tax law (EStG/UStG) pulled verbatim from official sources |
| [`guardrails/`](guardrails/) | The trust policy (`policy.md`) and its machine-readable config (`config.yaml`) — the two-stage safety gate + confidence engine that decides answer/hedge/clarify/decline/refuse |
| [`research/`](research/) | 21 real self-employed tax questions sourced from Toytown Germany, Etsy's seller community, and Reddit — tagged by topic and expected tier, the seed for both problem framing and the eval set |
| [`assistant/`](assistant/) | The working RAG pipeline as a Node/TypeScript CLI prototype — built and eval-tested first, before being ported. Runnable locally (`npm run ask "..."`) |
| [`supabase/functions/ask-tax-assistant/`](supabase/functions/ask-tax-assistant/) | The Deno port of the same pipeline, deployed as a live Supabase Edge Function — this is what the published demo actually calls |
| [`scripts/scraper.py`](scripts/scraper.py) | The Playwright + Gemini tool used to scrape Taxfix's own info-guide content in the first place |
| [`problem_framing.md`](problem_framing.md) | Who this is for and why, evidenced with real quotes, not assumed |
| [`metrics.md`](metrics.md) | How success is defined and measured — what's measurable today vs. what needs production instrumentation, and why |
| [`ai_build_log.md`](ai_build_log.md) | What was trusted, edited, and rejected while building this with AI assistance |
| [`taxfix_comparison.md`](taxfix_comparison.md) | An evidenced (not assumed) comparison against Taxfix's own existing AI assistant |
| [`lovable_prompt.md`](lovable_prompt.md) | The actual prompt used to build the live demo frontend in Lovable |

## Architecture, briefly

```
question → safety & scope gate → retrieval (data/) → confidence engine → grounded answer
              (guardrails/)                              (guardrails/)
```

A question is first classified against `guardrails/config.yaml`'s
categories — hard-refuse (fraud, prompt injection), soft-redirect
(off-topic), decline-and-handoff (legitimate but out-of-scope topics like
company car or trade tax), or in-scope. In-scope questions are then
embedded and matched against `data/`, and a retrieval-confidence score
(not the model's self-reported confidence) decides whether to answer
directly, hedge with caveats, ask a clarifying question, or hand off —
with an automated groundedness check on every generated answer before it
reaches the user. Full detail in `guardrails/policy.md`.

## Running the assistant locally

```bash
cd assistant
npm install
echo "GEMINI_API_KEY=your-key-here" > .env
npm run build-embeddings   # one-time: embed data/ into cache/embeddings.json
npm run ask "Can I deduct my home office as a freelancer?"
npm run eval                # run the full golden set against the pipeline
```

The deployed Supabase function (`supabase/functions/ask-tax-assistant/`)
is a Deno port of this same logic — see its own
[README](supabase/functions/ask-tax-assistant/README.md) for how its
bundled `config.json`/`embeddings.json` snapshots relate back to
`guardrails/config.yaml` and `data/`.

## Stack

TypeScript/Deno (assistant logic) · Gemini (embeddings, classification,
generation) · Supabase Edge Functions (deployment) · Lovable (frontend) ·
Claude Code (build tooling — see `ai_build_log.md` for what that actually
meant in practice).
