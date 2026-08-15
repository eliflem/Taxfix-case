# Where AI was used to build this, and what happened to its output

This whole project was built with Claude Code doing the implementation
work under direction — data collection, guardrail design, the RAG pipeline,
the Supabase port, the Lovable frontend, this doc. Three different AI
systems were actually in play, at different layers, and they get different
levels of trust:

- **Claude** — did the building: wrote code, drafted policy, proposed
  architecture, ran the eval loop.
- **Gemini** — powers the assistant itself (classification, embeddings,
  generation) inside the shipped product, not just during building.
- **Lovable's AI** — built the frontend from a single detailed prompt,
  deliberately kept out of writing the actual assistant logic (see
  "Rejected" below).

The organizing principle that emerged, and the honest answer to "what did
you trust": **nothing shipped on inspection alone.** Everything below that
counts as "trusted" earned it by passing a real test (a local run, a `curl`
against the live endpoint, an eval against real questions) — not by
reading the code and it looking right. Several things that looked right
weren't.

## Trusted (used close to as-generated, because it was verified, not because it looked plausible)

- **The two-stage guardrail architecture** (safety/scope gate, then a
  source-grounded confidence engine) — proposed once, never restructured.
  Everything that changed later was tuning within this shape, not the
  shape itself.
- **The RAG pipeline's core wiring** (config-driven classifier → retrieval
  → generation, reading `guardrails/config.yaml` at runtime rather than
  hardcoding category lists) — worked correctly on the first real test and
  stayed that way.
- **The Supabase Edge Function port** — a deliberate *port* of already-
  tested Node code, not a rewrite, specifically to keep trust transferable:
  logic verified once in the fast local loop didn't need re-verifying from
  scratch in Deno, only the platform-specific parts did (and one of those,
  the bundling behavior, still broke — see "Edited").
- **`scraper.py`'s use of Gemini** — narrow and bounded on purpose: format
  already-extracted text into clean Markdown, explicitly instructed not to
  invent or summarize content. Trusting an LLM to reformat is a much
  smaller ask than trusting it to originate facts, and the prompt reflects
  that distinction deliberately.
- **The Lovable frontend from the first prompt** — one comprehensive,
  screenshot-referenced prompt produced a working screen, correctly wired
  to the real Supabase backend, on the first pass. No back-and-forth
  needed to get the core structure right.

## Edited (AI output that was wrong, caught by testing, and corrected)

- **Confidence thresholds.** Shipped as explicit placeholders (0.75/0.55)
  because there was no data yet to set them properly — then recalibrated
  to 0.65/0.55 once the eval set produced a real score distribution. The
  placeholder was honest about being a guess; the guess was wrong by a
  meaningful margin (real "should-answer" questions scored 0.67–0.73,
  entirely below the original threshold).
- **The classifier applying persona-based reasoning instead of topic-based
  reasoning** — directly contradicted a policy I'd already written
  (`guardrails/policy.md`, "persona gate is per-rule, not per-user"). The
  policy said the right thing; the prompt enforcing it didn't, until a real
  Kleingewerbe user's question in the eval set got wrongly declined and
  exposed the gap.
- **Category scope errors in both directions** — `company_car_vehicle_taxation`
  was broad enough to catch an e-bike question; `off_topic` was narrow
  enough to miss a bookkeeping-practice question. Both found by running
  real questions through the system, not by reading the category list and
  judging it sufficient.
- **The `known_gaps` behavior never reaching the model.** Documented in
  config from early on, wired into the generation prompt only after
  testing showed answers weren't applying it — and the first wiring attempt
  itself was wrong (it leaked an unrelated number into off-topic answers
  and tripped the groundedness check), caught by the same eval run that
  caught the first bug.
- **Trade-tax content surfacing in answers for a persona it doesn't apply
  to.** The most serious correctness bug found: the retrieval corpus still
  contained the scraped Taxfix trade-tax section even though
  `guardrails/policy.md` documented it as out-of-scope for Freiberufler.
  A broad question retrieved it, and the model presented it as if it
  applied. Fixed by excluding it at the corpus-loading layer — the
  documentation was right; the data pipeline hadn't been made to agree
  with the documentation.
- **The Gemini model candidate list.** Initially populated with models
  that turned out to be newer/paid-tier-adjacent, granting only a token
  ~20-requests/day allowance on a free key — discovered via real 429
  errors mid-eval, not by reading pricing docs first. Replaced with the
  models Google actually designates for free-tier use, which also turned
  out to be dramatically faster (a real, unplanned latency fix).
- **The quota-rotation logic itself**, twice: first only rotated on quota
  errors, missed a deprecated-model 404 and just failed instead of
  continuing; second version added a wait-and-retry for per-minute limits
  after the first fix caused a rotation cascade through every remaining
  candidate's own limit in seconds.

## Rejected (considered or attempted, deliberately not used)

- **Doing the real-user-question research myself.** First attempt used
  WebFetch/browser tooling against Reddit and Toytown Germany — Reddit is
  policy-blocked for both, Toytown's forum closed in 2024 and refuses
  automated connections. Rather than settle for thread titles as the only
  evidence, the user did the actual sourcing directly and brought back
  richer, more detailed real questions than anything the tooling could
  have found. The AI-driven approach hit a real wall and was replaced with
  human legwork, not patched around.
- **Expanding the RAG corpus to close the AfA depreciation gap.**
  Considered once two real questions (a laptop, an e-bike) exposed that
  assets above the €800 GWG threshold aren't covered. Rejected in favor of
  documenting it as a known v1 limitation — the missing content is BMF
  administrative guidance (Afa-Tabellen), not statute text, and pulling it
  in would have meaningfully expanded scope for a case the system can
  already hedge honestly on.
- **Adding a new topic category for "process questions"** (which tax
  notices will I get, when should I separate a business card). Rejected
  in favor of folding these under the existing `off_topic`/soft-redirect
  category rather than growing the taxonomy for two examples.
- **Stripping markdown formatting from the generation prompt** as the fix
  for a Lovable rendering bug (asterisk/bold syntax showing literally
  instead of rendering). Rejected in favor of fixing the actual renderer —
  stripping formatting would have sacrificed the readability that bold and
  bullets genuinely add to a multi-condition tax explanation, to work
  around a frontend bug instead of fixing it.
- **Wiring up real persistence for the Helpful/Not-helpful feedback
  buttons**, suggested by Lovable as a next step. Rejected for v1 — it
  would mean adding a Supabase table, which breaks the deliberate
  stateless-edge-function decision made for a time-boxed prototype. Logged
  as a real v2 metric instead (`metrics.md`), not silently dropped.
- **Two Lovable-suggested polish items** ("add citation copy button,"
  "enable regenerate") — rejected outright as credit spend with no
  presentation payoff, versus earlier suggestions (tier badges, citations
  UI) that were accepted because they made a real design decision visibly
  demonstrable rather than just described in a doc.
- **Fighting Lovable's repo-creation model** to force it into the existing
  case-study repo. Rejected in favor of letting Lovable own a separate
  repo for the live demo, with this repo staying the source of truth for
  the RAG/guardrails/eval work — a case of not spending effort overriding
  a tool's opinionated default when a clean split was available instead.

## The pattern underneath all of this

Every "edited" item above was found by *running* something — a local
script, a live curl request, an eval pass — not by reading code or
prompts and judging them sound. That's the actual answer to "how do you
catch it when it's confidently wrong": you don't, by inspection. You catch
it by building the smallest possible thing that produces a real,
checkable output, and checking it, repeatedly, before trusting the next
layer on top.
