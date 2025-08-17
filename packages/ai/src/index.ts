import OpenAI from "openai";

const AI_BANTER_ENABLED = process.env.AI_BANTER_ENABLED === "true";
const AI_RECAP_ENABLED = process.env.AI_RECAP_ENABLED === "true";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function rivalBanter(seed: string, persona: "Aggro"|"Cautious"|"Gambler", timeLeftSec: number, hint: string) {
  if (!AI_BANTER_ENABLED) return null;
  // Using Responses API through openai SDK; keep it short and safe.
  const r = await client.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "system",
        content: "You are terse, cocky radio chatter in a maze race. One sentence, witty, no coordinates. Never reveal exact exit."
      },
      {
        role: "user",
        content: `seed=${seed} persona=${persona} time_left=${timeLeftSec}s hint="${hint}".`
      }
    ],
    max_output_tokens: 40
  });
  return r.output_text?.trim() ?? null;
}

export async function coachRecap(forkBias: string, loops: number, shortestVsActualPct: number) {
  if (!AI_RECAP_ENABLED) return "AI recap disabled.";
  const r = await client.responses.create({
    model: "gpt-4o-mini",
    input: [
      { role: "system", content: "Give a 2-sentence constructive racing recap. Mention one concrete habit to change."},
      { role: "user", content: `fork_bias=${forkBias}, loops=${loops}, optimality=${shortestVsActualPct.toFixed(0)}%` }
    ],
    max_output_tokens: 90
  });
  return r.output_text?.trim() ?? "Good run.";
}

