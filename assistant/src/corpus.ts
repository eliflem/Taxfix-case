import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./config.ts";

export interface Chunk {
  id: string;
  text: string;
  /** e.g. "Taxfix guide" or "EStG §4" — what to cite in an answer */
  sourceLabel: string;
  sourceFile: string;
  sourceUrl?: string;
}

const TAXFIX_GUIDE_PATH = path.join(REPO_ROOT, "data", "taxfix_scraped", "taxfix_info_guides.md");
const LAW_DIR = path.join(REPO_ROOT, "data", "german_tax_law");

// Corpus curation, not a data deletion — the raw scrape in data/ stays
// intact (it's evidence of the scraping work). These sections are excluded
// from what actually gets embedded/retrieved because they're out of scope
// for the Freiberufler persona (trade tax doesn't apply per EStG §18 — see
// guardrails/policy.md "Persona gate is per-rule, not per-user"). Real bug
// found in eval: without this exclusion, a broad "which taxes apply to me"
// question retrieved the trade-tax section and the model presented it as
// applicable to a Freiberufler user, which is factually wrong for this
// persona (research/user_questions.md tt2).
const EXCLUDED_SECTION_TITLES = ["Trade income", "Mandatory Filing"];

function chunkTaxfixGuide(): Chunk[] {
  const raw = readFileSync(TAXFIX_GUIDE_PATH, "utf-8");
  // Sections are separated by a line containing only "---"
  const sections = raw.split(/\n---\n/g).map((s) => s.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  for (const [i, section] of sections.entries()) {
    if (section.length < 20) continue; // skip stray fragments
    // Sections often have two headings ("# About you" then "# Occupation") —
    // the last one before the body is the specific topic, more useful as a citation label.
    const headings = [...section.matchAll(/^#{1,3}\s+(.+)$/gm)];
    const title = headings.length ? headings[headings.length - 1][1].trim() : `Section ${i}`;
    if (EXCLUDED_SECTION_TITLES.includes(title)) continue;
    chunks.push({
      id: `taxfix_guide_${i}`,
      text: section,
      sourceLabel: `Taxfix guide: ${title}`,
      sourceFile: "data/taxfix_scraped/taxfix_info_guides.md",
    });
  }
  return chunks;
}

function chunkLawFile(filename: string): Chunk[] {
  const filePath = path.join(LAW_DIR, filename);
  const raw = readFileSync(filePath, "utf-8");

  const h1 = raw.match(/^#\s+(.+)$/m);
  const citation = h1 ? h1[1].trim() : filename;
  const sourceUrlMatch = raw.match(/\*\*Source[^:]*:\*\*\s*(\S+)/);
  const sourceUrl = sourceUrlMatch ? sourceUrlMatch[1] : undefined;

  // Body is everything after the first "---" divider (metadata header above it)
  const bodyStart = raw.indexOf("\n---\n");
  const body = bodyStart >= 0 ? raw.slice(bodyStart + 5) : raw;

  const paragraphs = body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  for (const [i, para] of paragraphs.entries()) {
    if (para.length < 15) continue;
    const absatzMatch = para.match(/^\(([0-9]+[a-z]?)\)/);
    const label = absatzMatch ? `${citation} Abs. ${absatzMatch[1]}` : citation;
    chunks.push({
      id: `${filename}_${i}`,
      text: para,
      sourceLabel: label,
      sourceFile: `data/german_tax_law/${filename}`,
      sourceUrl,
    });
  }
  return chunks;
}

export function loadCorpus(): Chunk[] {
  const chunks: Chunk[] = [chunkTaxfixGuide()].flat();
  const lawFiles = readdirSync(LAW_DIR).filter((f) => f.endsWith(".md"));
  for (const f of lawFiles) {
    chunks.push(...chunkLawFile(f));
  }
  return chunks;
}
