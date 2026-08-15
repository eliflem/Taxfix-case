# ask-tax-assistant — Supabase Edge Function

Deno port of the working Node/TS prototype in `assistant/src/` — built and
eval-tested there first (see `guardrails/policy.md` "Eval results"), then
ported once the logic was verified, not written from scratch here. Same
two-stage pipeline: safety/scope classifier → retrieval-confidence engine →
grounded generation.

## Bundled files (deployment snapshots, not sources of truth)

- `config.json` — JSON snapshot of `guardrails/config.yaml`. Regenerate
  whenever the real one changes (from this directory):
  `node -e "const y=require('js-yaml'),fs=require('fs');fs.writeFileSync('config.json',JSON.stringify(y.load(fs.readFileSync('../../../guardrails/config.yaml','utf-8')),null,2))"`
- `embeddings.json` — copy of `assistant/cache/embeddings.json`
  (precomputed corpus embeddings). Regenerate whenever `data/` changes:
  `npm run build-embeddings` in `assistant/`, then
  `cp ../../../assistant/cache/embeddings.json .`

Both are imported statically (`import ... with { type: "json" }`), not read
at runtime via `Deno.readTextFile` — a runtime file read wasn't reliably
included in the deployed bundle without Docker running locally during
`supabase functions deploy`; static imports are picked up by the bundler
regardless. Real deploy is small and static enough that shipping a snapshot
with each deploy is simpler than adding a database dependency for v1.

## Secrets

`GEMINI_API_KEY` must be set as a Supabase project secret (via the
Supabase dashboard or `supabase secrets set`), never bundled as a file —
this function reads it with `Deno.env.get("GEMINI_API_KEY")`.

## Local testing

```
GEMINI_API_KEY=... deno run --allow-net --allow-env --allow-read index.ts
curl -X POST http://localhost:8000 -H "Content-Type: application/json" \
  -d '{"question":"Can I deduct my home office as a freelancer?"}'
```

## Known simplification vs. the Node CLI version

No persistent "last known working model" cache across requests (the CLI
version writes one to `cache/working_models.json`) — serverless
invocations don't reliably share a filesystem across cold starts, so each
request tries the model candidate list fresh and rotates on failure. Costs
one extra failed attempt on a cold model occasionally; not worth the
complexity of external state for a v1 prototype.
