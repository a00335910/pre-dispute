import { z } from "zod";
import { cfg } from "./config.js";

export const Proposal = z.object({
  action: z.enum(["notify", "partial_refund", "reship", "full_refund", "no_action"]),
  refund_amount: z.number().min(0).default(0),
  risk: z.number().min(0).max(1),
  reason: z.string(),
  message_to_buyer: z.string(),
});
export type Proposal = z.infer<typeof Proposal>;

// Free-tier Gemini has small per-model daily quotas and occasional stalls. Try each configured model in order,
// remember which ones are unavailable for a while, and let the caller fall back to rules if all of them fail.
const cooldownUntil = new Map<string, number>();
const COOLDOWN_MS = 10 * 60_000;

export async function askGemini(prompt: string): Promise<Proposal> {
  const models = [cfg.llmModel, ...cfg.llmFallbackModels].filter((m, i, a) => m && a.indexOf(m) === i);
  const ready = models.filter((m) => (cooldownUntil.get(m) ?? 0) < Date.now());
  const errors: string[] = [];

  for (const model of ready.length ? ready : models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": cfg.llmKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(12_000),
      });
      const j: any = await res.json();
      if (!res.ok) {
        errors.push(`${model}: ${res.status}`);
        if ([404, 429, 500, 503].includes(res.status)) { cooldownUntil.set(model, Date.now() + COOLDOWN_MS); continue; }
        break; // auth or request errors will not be fixed by another model
      }
      return Proposal.parse(JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text ?? ""));
    } catch (e: any) {
      errors.push(`${model}: ${e?.name === "TimeoutError" ? "timeout" : "invalid response"}`);
      cooldownUntil.set(model, Date.now() + COOLDOWN_MS);
    }
  }
  throw new Error(`No Gemini model available (${errors.join(", ")})`);
}
