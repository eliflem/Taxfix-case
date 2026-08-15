# Compared to Taxfix's existing AI assistant

Not a hypothetical comparison — Taxfix already ships an AI assistant
inside the self-employment flow (the info-popup chat), and it got tested
directly during this project rather than assumed to be a certain way.

## What it got right, and what we kept

Asked directly, in English: *"how can I trust your answers"*. Full reply
(in German — see below):

> Du kannst meinen Antworten vertrauen, weil mein Wissen auf verschiedenen
> Quellen basiert. Dazu gehören deutsche Gesetzestexte, die Informationen
> aus deinem Steuerfall (die ich nur lesen kann) und interne
> Taxfix-Informationen sowie häufig gestellte Fragen. Ich bin dafür da, dir
> allgemeine Steuerinformationen und Erklärungen zu deiner Taxfix-App zu
> geben. Ich gebe jedoch keine verbindliche Steuerberatung. Wenn eine
> Frage zu komplex ist oder du eine persönliche Beratung benötigst, kann
> ich dich jederzeit mit einem unserer menschlichen Experten verbinden.

The substance is right: don't provide binding tax advice, offer a human
expert at any time. Good enough that we deliberately kept it rather than
inventing new language — our own `standing_disclaimer`
(`guardrails/config.yaml`) is adapted directly from this, for product
consistency. One improvement made possible by having a smaller, sharper
system: theirs names its sources vaguely ("interne Taxfix-Informationen");
ours names exactly two ("Taxfix's own guidance for self-employed filers,
and the relevant German tax law") because that's genuinely all there is —
specificity here isn't a stylistic choice, it's a side effect of scope
discipline.

Content accuracy also checked out on the one example tested directly: a
question about who qualifies as Kleinunternehmer got the real thresholds
right (€25,000 prior-year / €100,000 current-year revenue) — matching what
we later independently verified against UStG §19 itself. No claim here
that their content is wrong; the differences below are about consistency
and transparency, not correctness.

## What was broken, found by testing rather than assumed

**Language consistency — observed twice, not once.** The same question
above got a German answer to an English question. It's not an isolated
slip: a separate test, *"Am I a Kleinunternehmer"* asked in English,
also got answered entirely in German. For a Taxfix user who isn't fluent
in German — plausibly a meaningful share of the actual self-employed user
base, especially in a product with an English UI — an assistant that
answers in a language they can't read is worse than useless, however
accurate the content. This assistant's `language_matching` rule exists
specifically because of this, verified live: a real German question
(company-car, sourced from `research/user_questions.md`) got a German
decline-and-handoff response in the deployed Lovable demo; an English
question gets English back, every time tested.

**Source transparency.** Neither observed Taxfix response showed which
source backed the answer — no citation, no reference to a specific guide
section or law. This assistant surfaces sources on every answer (a
collapsible "Sources N" panel in the live demo, `citations` in every API
response) — not because Taxfix's content is untrustworthy, but because for
a legal/financial answer, *showing your work* is part of what makes an
answer something a user can act on with confidence, not just a claim to
take on faith.

**Visible trust tiering.** Taxfix's assistant answers uniformly — same
presentation whether the underlying question is simple or genuinely
outside what it should attempt. Nothing observed in the UI signals "this
one's a confident answer" versus "this one needs a human." This assistant
makes that distinction visible on purpose (green "Answered" / amber
"General guidance" / a "Talk to a tax expert" button in place of a guessed
answer) — the guardrail tiers aren't just an internal implementation
detail, they're a user-facing trust signal.

## The honest framing for this comparison

This isn't "we built something better than Taxfix's assistant" as a
general claim — the sample size is two tested questions, and the one
content example checked out fine. It's narrower and more defensible than
that: *actually testing the thing you're building alongside* surfaced one
real, fixable inconsistency (language) and two design choices (source
transparency, visible trust tiering) worth making differently — and it's
the kind of finding that only shows up from testing, not from reading
about what the product does.
