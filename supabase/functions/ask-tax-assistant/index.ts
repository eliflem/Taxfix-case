// Supabase Edge Function — Deno runtime. Ported from the working Node/TS
// prototype in assistant/src/ (built and eval-tested first; this is a
// deliberate port of already-verified logic, not a from-scratch rewrite —
// see case_study_notes.md for why that ordering was chosen).
//
// POST { question: string } -> { tier, message, citations }

import { ask } from "./lib/pipeline.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // v1 simplification — fine for a prototype demo, would scope to the actual app origin for production
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) {
      return new Response(JSON.stringify({ error: "Missing 'question' string in request body" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const result = await ask(question);
    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: "Something went wrong answering that question. Please try again." }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
