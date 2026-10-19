import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/** Daraja callbacks. Safaricom does not sign callbacks, so we require a secret token in the URL,
 *  only update transactions we created, and only move them out of PENDING once (idempotent). */

function tokenOk(url: URL) {
  const expected = process.env["MPESA_CALLBACK_TOKEN"] ?? "";
  const got = url.searchParams.get("token") ?? "";
  if (!expected || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

const ack = () => Response.json({ ResultCode: 0, ResultDesc: "Accepted" });

const stkSchema = z.object({ Body: z.object({ stkCallback: z.object({
  CheckoutRequestID: z.string().max(100), ResultCode: z.number(), ResultDesc: z.string().max(500),
  CallbackMetadata: z.object({ Item: z.array(z.object({ Name: z.string(), Value: z.union([z.string(), z.number()]).optional() })) }).optional(),
}) }) });

const b2cSchema = z.object({ Result: z.object({
  OriginatorConversationID: z.string().max(100), ConversationID: z.string().max(100).optional(), ResultCode: z.number(), ResultDesc: z.string().max(500),
  TransactionID: z.string().max(50).optional(),
}) });

export const Route = createFileRoute("/api/public/mpesa/$kind")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const url = new URL(request.url);
        if (!tokenOk(url)) return new Response("Forbidden", { status: 403 });
        const json = await request.json().catch(() => null);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const m = await import("@/lib/mpesa.server");
        const now = new Date().toISOString();

        if (params.kind === "stk") {
          const p = stkSchema.safeParse(json);
          if (!p.success) return new Response("Bad request", { status: 400 });
          const cb = p.data.Body.stkCallback;
          const receipt = cb.CallbackMetadata?.Item.find((i) => i.Name === "MpesaReceiptNumber")?.Value;
          const status = cb.ResultCode === 0 ? "COMPLETED" : "FAILED";
          const { data } = await supabaseAdmin.from("mpesa_transactions").update({ status, result_code: cb.ResultCode, result_desc: cb.ResultDesc, receipt: receipt ? String(receipt) : null, completed_at: now, updated_at: now })
            .eq("checkout_request_id", cb.CheckoutRequestID).eq("status", "PENDING").select("id,amount,initiated_by,phone");
          const tx = data?.[0];
          if (tx && status === "FAILED") await m.financeAlert(tx.initiated_by, `Collection failed — KES ${tx.amount}`, `STK payment ${tx.id} from ${tx.phone} failed: ${cb.ResultDesc}`);
          return ack();
        }

        if (params.kind === "b2c-result" || params.kind === "b2c-timeout") {
          const p = b2cSchema.safeParse(json);
          if (!p.success) return new Response("Bad request", { status: 400 });
          const r = p.data.Result;
          const status = params.kind === "b2c-result" && r.ResultCode === 0 ? "COMPLETED" : "FAILED";
          const { data } = await supabaseAdmin.from("mpesa_transactions").update({ status, result_code: r.ResultCode, result_desc: params.kind === "b2c-timeout" ? "Timed out at M-Pesa" : r.ResultDesc, receipt: r.TransactionID ?? null, completed_at: now, updated_at: now })
            .eq("originator_conversation_id", r.OriginatorConversationID).eq("status", "PENDING").select("id,amount,initiated_by,phone");
          const tx = data?.[0];
          if (tx) await m.financeAlert(tx.initiated_by, status === "COMPLETED" ? `Payout sent — KES ${tx.amount}` : `Payout failed — KES ${tx.amount}`, `Payout ${tx.id} to ${tx.phone}: ${status}${r.TransactionID ? ` (receipt ${r.TransactionID})` : ""}. ${r.ResultDesc}`);
          return ack();
        }
        return new Response("Not found", { status: 404 });
      },
    },
  },
});
