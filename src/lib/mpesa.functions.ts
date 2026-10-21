import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canApprovePayout, checkAmount, checkDailyPayout, nairobiDayStartIso, normalizeKenyanPhone, type Limits } from "@/lib/mpesa-rules";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(ctx: Ctx) {
  const [a, s] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" }),
  ]);
  if (!a.data && !s.data) throw new Error("Only admins can use the M-Pesa gateway.");
  return { isSuperAdmin: !!s.data };
}

async function loadLimits(ctx: Ctx): Promise<Limits> {
  const { data } = await ctx.supabase.from("mpesa_settings").select("per_txn_max,daily_payout_max").eq("id", 1).maybeSingle();
  return { perTxnMax: Number(data?.per_txn_max ?? 150000), dailyPayoutMax: Number(data?.daily_payout_max ?? 1000000) };
}

async function usedToday(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("mpesa_transactions").select("amount").eq("direction", "B2C")
    .in("status", ["AWAITING_APPROVAL", "PENDING", "COMPLETED"]).gte("created_at", nairobiDayStartIso());
  return (data ?? []).reduce((t, r) => t + Number(r.amount), 0);
}

const myName = async (ctx: Ctx) => (await ctx.supabase.from("profiles").select("full_name").eq("id", ctx.userId).maybeSingle()).data?.full_name ?? "";
const phoneSchema = z.string().trim().max(20).transform((p, c) => { const n = normalizeKenyanPhone(p); if (!n) { c.addIssue({ code: "custom", message: "Enter a valid Kenyan phone number." }); return z.NEVER; } return n; });
const idem = z.string().trim().min(16).max(64).regex(/^[A-Za-z0-9-]+$/);

export const getGatewayStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isSuperAdmin } = await assertAdmin(context);
    const { configStatus } = await import("@/lib/mpesa.server");
    return { ...configStatus(), limits: await loadLimits(context), usedToday: await usedToday(), isSuperAdmin };
  });

/** C2B — STK push to a customer's phone. Same idempotency key = same transaction, never a second charge. */
export const startStkPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ phone: phoneSchema, amount: z.number().int(), accountRef: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9 -]+$/), description: z.string().trim().max(13).default(""), idempotencyKey: idem }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const err = checkAmount(data.amount, await loadLimits(context));
    if (err) throw new Error(err);
    const m = await import("@/lib/mpesa.server");
    const cfg = m.configStatus();
    if (cfg.stkMissing.length) throw new Error("M-Pesa collection keys are not set up yet.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await supabaseAdmin.from("mpesa_transactions").select("id,status").eq("idempotency_key", data.idempotencyKey).maybeSingle();
    if (existing.data) return { id: existing.data.id, status: existing.data.status, duplicate: true };
    const ins = await supabaseAdmin.from("mpesa_transactions").insert({
      direction: "C2B", idempotency_key: data.idempotencyKey, phone: data.phone, amount: data.amount, account_ref: data.accountRef,
      description: data.description, status: "PENDING", initiated_by: context.userId, initiated_by_name: await myName(context),
    }).select("id").single();
    if (ins.error) {
      if (ins.error.code === "23505") { const again = await supabaseAdmin.from("mpesa_transactions").select("id,status").eq("idempotency_key", data.idempotencyKey).single(); return { id: again.data!.id, status: again.data!.status, duplicate: true }; }
      throw new Error("Could not record the payment request.");
    }
    const id = ins.data.id;
    try {
      const r = await m.stkPush({ phone: data.phone, amount: data.amount, accountRef: data.accountRef, description: data.description });
      await supabaseAdmin.from("mpesa_transactions").update({ merchant_request_id: r.MerchantRequestID, checkout_request_id: r.CheckoutRequestID, result_desc: r.ResponseDescription, updated_at: new Date().toISOString() }).eq("id", id);
      await m.systemAudit(context.userId, `MPESA STK PUSH ${id.slice(0, 8)} KES ${data.amount} -> ${data.phone.slice(0, 6)}***`);
      return { id, status: "PENDING", duplicate: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "M-Pesa request failed.";
      await supabaseAdmin.from("mpesa_transactions").update({ status: "FAILED", result_desc: msg, updated_at: new Date().toISOString() }).eq("id", id);
      throw new Error(msg);
    }
  });

export const refreshStk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tx } = await supabaseAdmin.from("mpesa_transactions").select("*").eq("id", data.id).single();
    if (!tx?.checkout_request_id || tx.status !== "PENDING") return { status: tx?.status ?? "UNKNOWN" };
    const m = await import("@/lib/mpesa.server");
    const r = await m.stkQuery(tx.checkout_request_id);
    if (r.ResultCode === undefined) return { status: "PENDING" };
    const status = r.ResultCode === "0" ? "COMPLETED" : "FAILED";
    await supabaseAdmin.from("mpesa_transactions").update({ status, result_code: Number(r.ResultCode), result_desc: r.ResultDesc ?? null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", tx.id).eq("status", "PENDING");
    return { status };
  });

/** B2C — request a payout. It waits for a second admin before any money moves. */
export const requestPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ phone: phoneSchema, amount: z.number().int(), remarks: z.string().trim().min(3).max(100), idempotencyKey: idem }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const limits = await loadLimits(context);
    const err = checkAmount(data.amount, limits) ?? checkDailyPayout(data.amount, await usedToday(), limits);
    if (err) throw new Error(err);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await supabaseAdmin.from("mpesa_transactions").select("id,status").eq("idempotency_key", data.idempotencyKey).maybeSingle();
    if (existing.data) return { id: existing.data.id, duplicate: true };
    const ins = await supabaseAdmin.from("mpesa_transactions").insert({
      direction: "B2C", idempotency_key: data.idempotencyKey, phone: data.phone, amount: data.amount, description: data.remarks,
      status: "AWAITING_APPROVAL", initiated_by: context.userId, initiated_by_name: await myName(context),
    }).select("id").single();
    if (ins.error) { if (ins.error.code === "23505") return { id: "", duplicate: true }; throw new Error("Could not record the payout."); }
    const m = await import("@/lib/mpesa.server");
    await m.systemAudit(context.userId, `MPESA B2C REQUESTED ${ins.data.id.slice(0, 8)} KES ${data.amount} (awaiting 2nd approval)`);
    return { id: ins.data.id, duplicate: false };
  });

export const decidePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), approve: z.boolean(), reason: z.string().trim().max(300).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tx } = await supabaseAdmin.from("mpesa_transactions").select("*").eq("id", data.id).eq("direction", "B2C").single();
    if (!tx) throw new Error("Payout not found.");
    const blocked = canApprovePayout(tx.initiated_by, context.userId, tx.status);
    if (blocked) throw new Error(blocked);
    const m = await import("@/lib/mpesa.server");
    const now = new Date().toISOString();
    const name = await myName(context);
    if (!data.approve) {
      if (data.reason.length < 3) throw new Error("Give a reason for rejecting.");
      const r = await supabaseAdmin.from("mpesa_transactions").update({ status: "REJECTED", approved_by: context.userId, approved_by_name: name, rejected_reason: data.reason, updated_at: now }).eq("id", tx.id).eq("status", "AWAITING_APPROVAL").select("id");
      if (!r.data?.length) throw new Error("This payout was already handled.");
      await m.systemAudit(context.userId, `MPESA B2C REJECTED ${tx.id.slice(0, 8)}: ${data.reason}`);
      return { status: "REJECTED" };
    }
    if (m.configStatus().b2cMissing.length) throw new Error("M-Pesa payout keys are not set up yet.");
    const originatorId = crypto.randomUUID();
    // Atomic claim: only one approver can move it out of AWAITING_APPROVAL.
    const claim = await supabaseAdmin.from("mpesa_transactions").update({ status: "PENDING", approved_by: context.userId, approved_by_name: name, originator_conversation_id: originatorId, updated_at: now }).eq("id", tx.id).eq("status", "AWAITING_APPROVAL").select("id");
    if (!claim.data?.length) throw new Error("This payout was already handled.");
    try {
      const r = await m.b2cPayment({ phone: tx.phone, amount: Number(tx.amount), remarks: tx.description, originatorId });
      await supabaseAdmin.from("mpesa_transactions").update({ conversation_id: r.ConversationID, result_desc: r.ResponseDescription, updated_at: new Date().toISOString() }).eq("id", tx.id);
      await m.systemAudit(context.userId, `MPESA B2C APPROVED & SENT ${tx.id.slice(0, 8)} KES ${tx.amount}`);
      return { status: "PENDING" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "M-Pesa request failed.";
      await supabaseAdmin.from("mpesa_transactions").update({ status: "FAILED", result_desc: msg, updated_at: new Date().toISOString() }).eq("id", tx.id);
      await m.financeAlert(tx.initiated_by, `Payout failed — KES ${tx.amount}`, `Payout ${tx.id} to ${tx.phone} failed: ${msg}`);
      throw new Error(msg);
    }
  });

export const updateLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ perTxnMax: z.number().int().min(10).max(250000), dailyPayoutMax: z.number().int().min(100).max(50_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { isSuperAdmin } = await assertAdmin(context);
    if (!isSuperAdmin) throw new Error("Only the super admin can change payment limits.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("mpesa_settings").update({ per_txn_max: data.perTxnMax, daily_payout_max: data.dailyPayoutMax, updated_by: context.userId, updated_at: new Date().toISOString() }).eq("id", 1);
    const m = await import("@/lib/mpesa.server");
    await m.systemAudit(context.userId, `MPESA LIMITS -> per txn KES ${data.perTxnMax}, daily payouts KES ${data.dailyPayoutMax}`);
    return { ok: true };
  });

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("mpesa_transactions")
      .select("id,direction,phone,amount,account_ref,description,status,receipt,result_desc,initiated_by,initiated_by_name,approved_by_name,rejected_reason,created_at")
      .order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  });
