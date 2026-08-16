# Knowledge base — data sources

Two-layer dataset for the RAG assistant, both scoped to: **self-employed
Freiberufler in Germany, first-time or early filer**, tax year **2025**.

## 1. `taxfix_scraped/` — Taxfix's own guidance

`taxfix_info_guides.md` — the explanatory copy behind the info (ⓘ) icons in
Taxfix's self-employment filing flow, collected by hand by going through the
flow and scraping each popup with [`scripts/scraper.py`](../scripts/scraper.py)
(Playwright + Gemini: the user opens each popup, the script reads the modal DOM
and has Gemini reformat the raw text into clean Markdown — no content is
invented, only reformatted). Covers occupation/status questions,
Kleinunternehmerregelung, recurring business costs, home office, work
equipment/GWG, VAT rate allocation, gifts to business partners, waste disposal
input tax, and trade income thresholds.

**Known issue to reconcile:** this file mixes 2024 and 2025 references in a
few places (an artifact of scraping a live app mid-transition between tax
years). Since we're anchoring on tax year 2025, treat 2024-specific figures
here as needing a cross-check against the law files below before using them
in an answer.

## 2. `german_tax_law/` — official statute text

Six sections pulled directly from [gesetze-im-internet.de](https://www.gesetze-im-internet.de/)
(published by the Bundesministerium der Justiz — the official, current
consolidated text of German federal law). Fetched as raw HTML and parsed to
Markdown programmatically (not summarized by a model) to keep the wording
exact — this matters for a legal knowledge base, where a paraphrasing pass
is itself a source of the kind of error we're trying to design against.

Statute text is a Werk amtlichen Charakters (§ 5 UrhG) — not copyrightable,
safe to reproduce in full.

| File | Section | Why it's here |
|---|---|---|
| `estg_4_betriebsausgaben.md` | EStG §4 | Business expense definition + the specific limits already referenced in the scraped Taxfix content: gifts >€50, business meals 70% rule, home office flat rates (§4 Abs. 5 Nr. 6b/6c) |
| `estg_6_geringwertige_wirtschaftsgueter.md` | EStG §6 Abs. 2 / 2a only | Low-value asset (GWG) immediate write-off threshold. **Deliberately trimmed** — full §6 also covers general balance-sheet asset valuation, company-car/EV benefit-in-kind taxation, and corporate reserves, none of which apply to a cash-basis (EÜR) Freiberufler. See scoping note below. |
| `estg_18_selbststaendige_arbeit.md` | EStG §18 | Defines who counts as Freiberufler vs. Gewerbebetrieb — used to keep the assistant's scope honest (see Gewerbesteuer note below) |
| `ustg_19_kleinunternehmer.md` | UStG §19 | Kleinunternehmerregelung thresholds and mechanics |
| `ustg_12_steuersaetze.md` | UStG §12 | VAT rates: 19% standard, 7% reduced, 0% (photovoltaic) |
| `ustg_15_vorsteuerabzug.md` | UStG §15 | Input tax deduction — the contrast case for why Kleinunternehmer can't claim input tax back |

Each file carries its source URL, retrieval date, and a scope note in the
header.

## Scope decisions this dataset encodes

- **Kleinunternehmer thresholds are current-law (2025+):** €25,000 prior-year
  revenue / €100,000 current-year revenue (UStG §19 Abs. 1, raised by the
  Wachstumschancengesetz effective 1 Jan 2025). The scraped Taxfix content
  doesn't state exact thresholds, so this is the authoritative figure to use.
- **Company car / vehicle taxation is out of scope for v1**, even though it
  appears as an option in the Taxfix flow ("Special Costs as a Self-Employed
  Person"). It's a narrow, high-complexity area (EV phase-in rules, Fahrtenbuch
  requirements) — better suited to a human-expert handoff than a RAG answer.
  This is why `estg_6` only carries Abs. 2/2a.
- **Trade tax (Gewerbesteuer) is out of scope for v1.** The scraped Taxfix
  content includes a "Trade income" / Gewerbesteuer section, but per EStG §18,
  Freiberufler income is explicitly *not* Gewerbebetrieb income — trade tax
  doesn't apply to this persona. Kept in `estg_18` as the reasoning source for
  why the assistant should decline trade-tax questions rather than answer them
  (a real Gewerbe user asking would need a different persona/knowledge base).

## Not yet in this dataset

- Reddit/blog-sourced real user questions (separate curation effort, for
  problem framing — not part of the retrieval corpus)
- Eval question set (sample Q&A pairs with expected answers/citations)
