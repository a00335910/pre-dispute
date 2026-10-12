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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Free-tier Gemini returns transient 429/503s, so retry with backoff and fall back to a second model.
export async function askGemini(prompt: string): Promise<Proposal> {
  const models = [cfg.llmModel, cfg.llmFallbackModel];
  let lastError = "unknown";
  for (let attempt = 0; attempt < 5; attempt++) {
    const model = models[attempt % models.length];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": cfg.llmKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    });
    const j: any = await res.json();
    if (!res.ok) {
      lastError = `Gemini ${res.status} (${model}): ${j.error?.message ?? "error"}`;
      if ([429, 500, 503, 404].includes(res.status)) { await sleep(1000 * 2 ** attempt); continue; }
      throw new Error(lastError);
    }
    try {
      return Proposal.parse(JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text ?? ""));
    } catch {
      lastError = `Gemini (${model}) returned invalid JSON`;
    }
  }
  throw new Error(lastError);
}
