# Problem framing — evidenced, not assumed

The case study's own framing: self-employed Taxfix users hit questions the
product doesn't answer well, and today they **guess, give up, or wait for
a human tax expert**. Rather than take that as given, this is what real
people asking real versions of those questions actually looks like —
20 questions pulled from Toytown Germany (closed 2024, historical threads
still indexed), Etsy's German seller community, and Reddit
(r/germany, r/freelanceWriters, r/selbststaendig), full detail in
`research/user_questions.md`.

## Who this is for

**Freiberufler / self-employed freelancer in Germany, first-time or early
filer.** Not a blanket "anyone self-employed" — narrowed deliberately after
the real questions came in and showed a persona boundary that mattered:
Kleingewerbe/Einzelunternehmer users ask overlapping but not identical
questions (trade tax applies to them, doesn't apply to Freiberufler), and
at least one real question read as coming from an employee, not someone
self-employed at all. The scope decision came from the evidence, not
before it.

## The three failure modes, each with a real example

**Guess.** A Reddit user leasing a car works through the VAT
advance-return math themselves, unprompted: *"Verstehe ich es richtig,
dass ich 1% des Bruttolistenpreises... als zusätzlichen Gewinn versteuern
und in Elster auch angeben muss?... Läuft das so, oder habe ich einen
Denkfehler?"* — self-checking their own reasoning because there's nowhere
better to check it. This is the failure mode with the real downside: a
guess that's wrong doesn't fail loudly, it just becomes a wrong return.

**Give up / avoid the decision.** An Etsy seller asks the community
whether losing Kleinunternehmer status is worth it — *"do people regret
switching?"* — not because the mechanics are unclear (they're not; that
part's answerable) but because the uncertainty about the *subjective*
consequences is enough to stall the decision entirely. A colleague-relayed
question about a party-rental side business is even more telling: the
asker (not even the business owner) is *"als Laie überrascht wie einfach
bzw. naiv das gehen soll"* — surprised how casually someone was prepared
to just start, unaware of what they didn't know. Guessing has a visible
failure mode; not asking at all has an invisible one.

**Wait for a human tax expert.** A first-time company-car buyer states the
gap directly: *"Steuerberater werde ich auch fragen, aber ich möchte
vorher grob verstehen, worauf ich achten muss"* — I'll ask a tax advisor
too, but I want to roughly understand what to watch for first. That's not
"give me the professional answer instead of a human" — it's "give me
enough to make the eventual human conversation useful," which is a
different, narrower, and more honest job for an assistant to have. Cost is
part of it too: a freelance journalist replacing a dying laptop says
plainly, *"I don't have 'accountant money' right now."*

**The best single quote in the set** — same car-leasing thread as above,
closing line: *"Mir raucht der Kopf"* ("my head is spinning"). Real,
visceral evidence of exactly the moment this assistant is built to
recognize and hand off rather than guess through: `company_car_vehicle_
taxation` combined with `personalized_tax_calculation`, both explicitly
out of scope, both declined-and-handed-off by design (`guardrails/
config.yaml`), not by accident.

## This isn't a contrived scope — the same handful of topics keep recurring

Across three independent sources spanning **2007 to 2026**, the same
topics come up over and over: home office deduction, VAT/Kleinunternehmer
mechanics, equipment/GWG thresholds, and company car/vehicle questions.
That's not a scope picked to make a demo look good in retrospect — it's
what a 20-year-old English-language expat forum, a craft-seller community,
and current Reddit threads independently kept producing when asked the
same underlying question in different words, in different years, in
different platforms. The six in-scope topics in `guardrails/config.yaml`
map directly onto this recurrence, not the other way around.

## Methodology, briefly and honestly

Reddit is policy-blocked for this session's own tooling (both fetch and
browser) — real Reddit questions in this set were sourced manually, not by
an agent. Toytown Germany's forum closed in 2024 and its server refuses
automated connections now; what's usable from it is real, dated thread
titles (still legitimate evidence — verifiable via URL and date) rather
than full post bodies. Where the tooling hit a real wall, the answer was
doing the research directly rather than settling for weaker evidence (see
`ai_build_log.md`, "Rejected" section).
