Build a single screen that recreates the look of the Taxfix tax-filing app with an AI assistant chat panel open on the right side — I've attached a real screenshot of Taxfix's own app in this exact state, match its layout and style closely (colors, spacing, typography, header, the chat bubble style).

**Left side (~60% width) — static screen chrome, not functional:**
- Top bar: Taxfix logo (green wordmark) top-left, a "Who helps me?" link top-right with a person icon
- Below that: a back arrow + "BACK" label, and a thin green progress bar
- Main content: a light green card with a bold question headline, e.g. "Did you generate income from the following investments in 2025?", and below it a short list of checkbox options (e.g. Capital Gains, Crypto, Sale of private assets, No) with a green "Confirm" button at the bottom
- This side doesn't need real interactivity — it's just visual context establishing "this is inside the Taxfix app." A left sidebar with a couple of nav items (e.g. "Income" with an icon, "Wage replacement — Yes", "Other income") like the screenshot is a nice touch but not essential.

**Right side (~40% width) — the actual working chat panel:**
- Header: a close (X) icon top-left, "AI Assistant" label with a small icon
- Message thread: AI messages in light cream/peach rounded bubbles (left-aligned, with a small icon avatar), user messages in white bordered bubbles (right-aligned, prefixed with "@AI Assistant" in green like a mention tag). Each AI message shows a timestamp and small "👍 Helpful / 👎 Not helpful" links underneath.
- Below each AI response, if the response includes a "tier" (see below), show a small subtle badge or colored dot near the timestamp indicating it — e.g. green dot = answered directly, amber = hedged/general guidance, and if the tier is "decline_and_handoff" or "decline", show a small button "Talk to a tax expert" instead of plain text
- Input area pinned to the bottom: a "@AI Assistant" dropdown chip on the left, a text input "Write something...", and a send arrow button on the right
- On send: call the Supabase edge function named `ask-tax-assistant` with `{ question: <the text> }` via the Supabase JS client (`supabase.functions.invoke('ask-tax-assistant', { body: { question } })`), and render the returned `message` as a new AI bubble. The response also includes `tier` and `citations` fields — use `tier` for the badge described above; `citations` can be shown as small superscript source tags or omitted from the UI for now, your call on what looks clean.
- Show a simple typing/loading indicator while waiting for the response.

**Backend — already built and live, do not recreate it:**
- Connect this project to my EXISTING Supabase project (project ref `<your-project-ref>` — redacted here; the real ref was used in the prompt as sent) — do not create a new Supabase project. When the Supabase connection dialog comes up, choose to link an existing project and select that one.
- That project already has a working, deployed edge function called `ask-tax-assistant`. It takes `POST { question: string }` and returns `{ tier: string, message: string, citations: string[] }`. Do NOT write, stub, or regenerate this function — it's a real RAG pipeline (retrieval + guardrails + Gemini generation) that's already built, tested, and live. Your only job on the backend side is making sure this frontend calls it correctly: `supabase.functions.invoke('ask-tax-assistant', { body: { question } })`.
- If the Supabase client isn't already configured in this project, set it up pointing at that same linked project — no new tables, no schema, no migrations needed, this function is stateless.

**Style notes:** Taxfix's brand green (roughly `#7ED321`/`#4A7C2C` range — match what you see in the screenshot), clean sans-serif type, generous whitespace, rounded corners on cards and buttons. Keep the whole thing on one page, no routing needed.
