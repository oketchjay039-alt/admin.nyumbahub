import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";

const triageSchema = z.object({
  summary: z.string(),
  priority: z.enum(["P1", "P2", "P3"]),
  rationale: z.string(),
  reply: z.string(),
});
export type TicketTriage = z.infer<typeof triageSchema>;

const INSTRUCTIONS = `You are a senior support analyst for NyumbaHub, a Kenyan real estate, short-stay and M-Pesa payments platform.
Given a customer support ticket, return:
- summary: 1-2 sentences describing the core issue.
- priority: P1 (money lost/stuck, account locked, safety, outage), P2 (blocked workflow, delayed payout, moderation stuck), P3 (questions, minor issues).
- rationale: one short sentence explaining the priority.
- reply: a polite, concise draft reply to the customer (under 120 words), in English, signed "NyumbaHub Support". Never promise refunds or timelines you cannot verify; never ask for PINs.`;

export async function triageTicket(message: string): Promise<TicketTriage> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI is not configured (missing key).");
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    instructions: INSTRUCTIONS,
    prompt: `Ticket message:\n"""\n${message}\n"""`,
    output: Output.object({ schema: triageSchema }),
    maxRetries: 0,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  try {
    return await result.output;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/402/.test(msg)) throw new Error("AI credits are used up. Add credits in workspace billing.");
    if (/429/.test(msg)) throw new Error("AI is busy right now. Please try again in a moment.");
    throw new Error(`AI triage failed: ${msg.slice(0, 200)}`);
  }
}
