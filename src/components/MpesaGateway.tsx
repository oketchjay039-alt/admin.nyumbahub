import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { decidePayout, getGatewayStatus, listTransactions, refreshStk, requestPayout, startStkPush, updateLimits } from "@/lib/mpesa.functions";

type Tx = Awaited<ReturnType<typeof listTransactions>>[number];
type Status = Awaited<ReturnType<typeof getGatewayStatus>>;
const kes = (n: number) => `KES ${Number(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
const tone = (s: string) => (s === "COMPLETED" ? "badge-ok" : s === "FAILED" || s === "REJECTED" ? "badge-bad" : "badge-warn");
const key = () => crypto.randomUUID();
const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export function MpesaGateway({ signedIn, myId, onSignIn }: { signedIn: boolean; myId: string | null; onSignIn: () => void }) {
  const fStatus = useServerFn(getGatewayStatus), fList = useServerFn(listTransactions), fStk = useServerFn(startStkPush),
    fRefresh = useServerFn(refreshStk), fPayout = useServerFn(requestPayout), fDecide = useServerFn(decidePayout), fLimits = useServerFn(updateLimits);
  const [status, setStatus] = useState<Status | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "C2B" | "B2C" | "QUEUE">("ALL");
  const [stk, setStk] = useState({ phone: "", amount: "", ref: "", desc: "", k: key() });
  const [po, setPo] = useState({ phone: "", amount: "", remarks: "", k: key() });
  const [lim, setLim] = useState({ per: "", daily: "" });

  const load = useCallback(async () => {
    try { const [st, l] = await Promise.all([fStatus(), fList()]); setStatus(st); setTxs(l); setLim({ per: String(st.limits.perTxnMax), daily: String(st.limits.dailyPayoutMax) }); setErr(null); }
    catch (e) { setErr(msg(e)); }
  }, [fStatus, fList]);
  useEffect(() => { if (signedIn) void load(); }, [signedIn, load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setErr(null); setNote(null);
    try { await fn(); setNote(ok); await load(); } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };

  if (!signedIn) return (
    <div className="flex h-full flex-col items-center justify-center gap-3 border border-border bg-card font-mono text-xs">
      <div className="font-bold uppercase">M-Pesa Gateway is restricted</div>
      <div className="text-muted-foreground">Sign in through Mail with an admin account to collect or pay out money.</div>
      <button className="btn-primary" onClick={onSignIn}>Sign in</button>
    </div>
  );

  const rows = txs.filter((t) => filter === "ALL" || (filter === "QUEUE" ? t.status === "AWAITING_APPROVAL" : t.direction === filter));
  const queue = txs.filter((t) => t.status === "AWAITING_APPROVAL").length;
  const missing = status ? [...new Set([...status.stkMissing, ...status.b2cMissing])] : [];

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col border border-border bg-card">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3 font-mono text-[11px] font-bold uppercase tracking-wider">
          <span>Daraja Transactions :: {status?.environment ?? "…"}</span>
          <span className="flex gap-1">{(["ALL", "C2B", "B2C", "QUEUE"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={f === filter ? "btn-primary" : "btn-secondary"}>{f === "QUEUE" ? `Approvals (${queue})` : f}</button>
          ))}<button className="btn-secondary" onClick={() => void load()}>Refresh</button></span>
        </div>
        {missing.length > 0 && <div className="border-b border-border bg-active-soft px-3 py-1.5 font-mono text-[10px] text-primary">KEYS NOT SET: {missing.join(", ")} — requests will be refused until they are added.</div>}
        {err && <div role="alert" className="border-b border-border px-3 py-1.5 font-mono text-[11px] text-bad">{err}</div>}
        {note && <div className="border-b border-border px-3 py-1.5 font-mono text-[11px] text-ok">{note}</div>}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted font-mono text-[10px] uppercase text-muted-foreground"><tr>{["Time", "Dir", "Phone", "Amount", "Ref / Remarks", "By", "Status", ""].map((h) => <th key={h} className="px-2 py-1.5 text-left">{h}</th>)}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="py-10 text-center font-mono text-[11px] text-muted-foreground">NO TRANSACTIONS YET</td></tr>}
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-border-subtle align-top">
                  <td className="px-2 py-1.5 font-mono">{new Date(t.created_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", hour12: false })}</td>
                  <td className="px-2 py-1.5 font-mono">{t.direction}</td>
                  <td className="px-2 py-1.5 font-mono">{t.phone}</td>
                  <td className="px-2 py-1.5 text-right font-mono font-semibold">{kes(t.amount)}</td>
                  <td className="px-2 py-1.5">{t.account_ref || t.description}{t.receipt && <div className="font-mono text-[10px] text-ok">{t.receipt}</div>}{t.result_desc && t.status === "FAILED" && <div className="text-[10px] text-bad">{t.result_desc}</div>}{t.rejected_reason && <div className="text-[10px] text-bad">{t.rejected_reason}</div>}</td>
                  <td className="px-2 py-1.5 text-[11px]">{t.initiated_by_name}{t.approved_by_name && <div className="text-muted-foreground">✓ {t.approved_by_name}</div>}</td>
                  <td className="px-2 py-1.5"><span className={`badge ${tone(t.status)}`}>{t.status.replace("_", " ")}</span></td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {t.direction === "C2B" && t.status === "PENDING" && <button className="btn-secondary" disabled={busy} onClick={() => run(() => fRefresh({ data: { id: t.id } }), "Status checked with M-Pesa.")}>Check</button>}
                    {t.status === "AWAITING_APPROVAL" && (t.initiated_by === myId
                      ? <span className="font-mono text-[10px] text-muted-foreground">NEEDS 2ND ADMIN</span>
                      : <span className="flex gap-1">
                          <button className="btn-primary" disabled={busy} onClick={() => { if (confirm(`Send ${kes(t.amount)} to ${t.phone}?`)) void run(() => fDecide({ data: { id: t.id, approve: true, reason: "" } }), "Payout approved and sent."); }}>Approve</button>
                          <button className="btn-danger" disabled={busy} onClick={() => { const r = prompt("Reason for rejecting:"); if (r) void run(() => fDecide({ data: { id: t.id, approve: false, reason: r } }), "Payout rejected."); }}>Reject</button>
                        </span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="w-[30%] min-w-64 space-y-3 overflow-auto border border-border bg-card p-3">
        {status && <div className="border border-border bg-muted p-2 font-mono text-[10px]">
          <div>PER TXN MAX: {kes(status.limits.perTxnMax)}</div>
          <div>DAILY PAYOUTS: {kes(status.usedToday)} / {kes(status.limits.dailyPayoutMax)}</div>
        </div>}

        <form className="space-y-1.5" onSubmit={(e) => { e.preventDefault(); void run(() => fStk({ data: { phone: stk.phone, amount: Number(stk.amount), accountRef: stk.ref, description: stk.desc, idempotencyKey: stk.k } }).then(() => setStk({ phone: "", amount: "", ref: "", desc: "", k: key() })), "Payment prompt sent to the customer's phone."); }}>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Collect (C2B · STK push)</div>
          <input required className="field w-full font-mono" placeholder="Phone e.g. 0712 345 678" value={stk.phone} onChange={(e) => setStk({ ...stk, phone: e.target.value })} />
          <input required className="field w-full font-mono" type="number" min={1} step={1} placeholder="Amount (KES)" value={stk.amount} onChange={(e) => setStk({ ...stk, amount: e.target.value })} />
          <input required maxLength={12} className="field w-full font-mono" placeholder="Account ref (max 12)" value={stk.ref} onChange={(e) => setStk({ ...stk, ref: e.target.value })} />
          <input maxLength={13} className="field w-full" placeholder="Description (optional)" value={stk.desc} onChange={(e) => setStk({ ...stk, desc: e.target.value })} />
          <button className="btn-primary w-full" disabled={busy}>Send payment prompt</button>
        </form>

        <form className="space-y-1.5" onSubmit={(e) => { e.preventDefault(); void run(() => fPayout({ data: { phone: po.phone, amount: Number(po.amount), remarks: po.remarks, idempotencyKey: po.k } }).then(() => setPo({ phone: "", amount: "", remarks: "", k: key() })), "Payout requested — a second admin must approve it."); }}>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Pay out (B2C · needs 2nd admin)</div>
          <input required className="field w-full font-mono" placeholder="Recipient phone" value={po.phone} onChange={(e) => setPo({ ...po, phone: e.target.value })} />
          <input required className="field w-full font-mono" type="number" min={1} step={1} placeholder="Amount (KES)" value={po.amount} onChange={(e) => setPo({ ...po, amount: e.target.value })} />
          <input required minLength={3} maxLength={100} className="field w-full" placeholder="Remarks e.g. Host payout BK-123" value={po.remarks} onChange={(e) => setPo({ ...po, remarks: e.target.value })} />
          <button className="btn-primary w-full" disabled={busy}>Request payout</button>
        </form>

        {status?.isSuperAdmin && <form className="space-y-1.5" onSubmit={(e) => { e.preventDefault(); void run(() => fLimits({ data: { perTxnMax: Number(lim.per), dailyPayoutMax: Number(lim.daily) } }), "Limits updated."); }}>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Limits (super admin)</div>
          <label className="block text-[11px]">Per transaction (KES)<input className="field w-full font-mono" type="number" min={10} max={250000} value={lim.per} onChange={(e) => setLim({ ...lim, per: e.target.value })} /></label>
          <label className="block text-[11px]">Daily payouts (KES)<input className="field w-full font-mono" type="number" min={100} value={lim.daily} onChange={(e) => setLim({ ...lim, daily: e.target.value })} /></label>
          <button className="btn-secondary w-full" disabled={busy}>Save limits</button>
        </form>}
      </div>
    </div>
  );
}
