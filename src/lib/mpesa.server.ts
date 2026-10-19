/** Server-only Daraja client. Credentials are read from server env inside each call and never returned. */

const env = (k: string) => process.env[k] ?? "";

export const REQUIRED_STK = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY"] as const;
export const REQUIRED_B2C = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_B2C_SHORTCODE", "MPESA_INITIATOR_NAME", "MPESA_SECURITY_CREDENTIAL"] as const;

export function configStatus() {
  const missing = (keys: readonly string[]) => keys.filter((k) => !env(k));
  return {
    environment: env("MPESA_ENV") === "production" ? "production" : "sandbox",
    stkMissing: missing(REQUIRED_STK),
    b2cMissing: missing(REQUIRED_B2C),
    callbackReady: !!env("MPESA_CALLBACK_TOKEN"),
  };
}

const baseUrl = () => (env("MPESA_ENV") === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");
const callbackBase = () => (env("MPESA_CALLBACK_BASE_URL") || "https://project--128de4dd-30e5-492c-adc8-8e6988630666.lovable.app").replace(/\/+$/, "");
export const callbackUrl = (kind: "stk" | "b2c-result" | "b2c-timeout") =>
  `${callbackBase()}/api/public/mpesa/${kind}?token=${encodeURIComponent(env("MPESA_CALLBACK_TOKEN"))}`;

async function token(): Promise<string> {
  const basic = btoa(`${env("MPESA_CONSUMER_KEY")}:${env("MPESA_CONSUMER_SECRET")}`);
  const r = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${basic}` } });
  if (!r.ok) { console.error("[mpesa] oauth failed", r.status); throw new Error("Could not reach M-Pesa. Check the gateway keys."); }
  const j = (await r.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("M-Pesa did not return an access token.");
  return j.access_token;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${baseUrl()}${path}`, { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { errorMessage?: string };
  if (!r.ok) { console.error("[mpesa]", path, r.status, j); throw new Error(j.errorMessage ?? `M-Pesa rejected the request (${r.status}).`); }
  return j;
}

const timestamp = () => {
  const d = new Date(Date.now() + 3 * 3600_000).toISOString();
  return d.slice(0, 19).replace(/[-T:]/g, "");
};

export async function stkPush(p: { phone: string; amount: number; accountRef: string; description: string }) {
  const ts = timestamp();
  const sc = env("MPESA_SHORTCODE");
  return post<{ MerchantRequestID: string; CheckoutRequestID: string; ResponseCode: string; ResponseDescription: string }>("/mpesa/stkpush/v1/processrequest", {
    BusinessShortCode: sc, Password: btoa(`${sc}${env("MPESA_PASSKEY")}${ts}`), Timestamp: ts,
    TransactionType: "CustomerPayBillOnline", Amount: p.amount, PartyA: p.phone, PartyB: sc, PhoneNumber: p.phone,
    CallBackURL: callbackUrl("stk"), AccountReference: p.accountRef.slice(0, 12), TransactionDesc: p.description.slice(0, 13) || "Payment",
  });
}

export async function stkQuery(checkoutRequestId: string) {
  const ts = timestamp();
  const sc = env("MPESA_SHORTCODE");
  return post<{ ResultCode?: string; ResultDesc?: string }>("/mpesa/stkpushquery/v1/query", {
    BusinessShortCode: sc, Password: btoa(`${sc}${env("MPESA_PASSKEY")}${ts}`), Timestamp: ts, CheckoutRequestID: checkoutRequestId,
  });
}

export async function b2cPayment(p: { phone: string; amount: number; remarks: string; originatorId: string }) {
  return post<{ ConversationID: string; OriginatorConversationID: string; ResponseCode: string; ResponseDescription: string }>("/mpesa/b2c/v3/paymentrequest", {
    OriginatorConversationID: p.originatorId, InitiatorName: env("MPESA_INITIATOR_NAME"), SecurityCredential: env("MPESA_SECURITY_CREDENTIAL"),
    CommandID: "BusinessPayment", Amount: p.amount, PartyA: env("MPESA_B2C_SHORTCODE"), PartyB: p.phone,
    Remarks: p.remarks.slice(0, 100) || "Host payout", QueueTimeOutURL: callbackUrl("b2c-timeout"), ResultURL: callbackUrl("b2c-result"), Occasion: "NyumbaHub",
  });
}

/** Send a system alert to the Finance department, from the admin who started the transaction. */
export async function financeAlert(senderId: string, subject: string, body: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: members } = await supabaseAdmin.from("profiles").select("id").eq("department", "Finance").eq("active", true);
    const ids = (members ?? []).map((m) => m.id).filter((id) => id !== senderId);
    if (!ids.length) return;
    const id = crypto.randomUUID();
    const { error } = await supabaseAdmin.from("mail_messages").insert({ id, thread_id: id, sender_id: senderId, subject, body, priority: "high", confidential: true, labels: ["M-Pesa"], to_label: "#Finance" });
    if (!error) await supabaseAdmin.from("mail_recipients").insert(ids.map((user_id) => ({ message_id: id, user_id })));
  } catch (e) { console.error("[mpesa] finance alert failed", e); }
}

/** Write an audit entry on behalf of the system (actor = the admin who started the transaction). */
export async function systemAudit(actorId: string, action: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: p } = await supabaseAdmin.from("profiles").select("full_name,email").eq("id", actorId).maybeSingle();
  await supabaseAdmin.from("audit_log").insert({ actor_id: actorId, actor_name: p?.full_name ?? "", actor_email: p?.email ?? "", action });
}
