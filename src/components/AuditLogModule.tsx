import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Lock, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const CATEGORIES = ["ALL", "KYC", "LISTING", "PAYMENT", "PAYOUT", "TICKET", "SETTINGS"] as const;
type Category = (typeof CATEGORIES)[number];

export interface AuditEntry { id: number; actor_name: string; actor_email: string; action: string; created_at: string }

function categorize(msg: string): Exclude<Category, "ALL"> | "OTHER" {
  if (msg.startsWith("KYC")) return "KYC";
  if (msg.startsWith("LISTING")) return "LISTING";
  if (msg.startsWith("DARAJA")) return "PAYMENT";
  if (msg.startsWith("B2C")) return "PAYOUT";
  if (msg.startsWith("TKT")) return "TICKET";
  if (msg.startsWith("SETTINGS")) return "SETTINGS";
  return "OTHER";
}

/** Persists new terminal log lines to the shared append-only audit log and streams everyone's entries. */
export function useAuditLog(localLog: string[], uid: string | null) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [unsaved, setUnsaved] = useState(0);
  const seen = useRef(localLog.length);

  useEffect(() => {
    if (!uid) { setEntries([]); return; }
    let live = true;
    supabase.from("audit_log").select("id,actor_name,actor_email,action,created_at").order("id", { ascending: false }).limit(1000)
      .then(({ data }) => { if (live && data) setEntries(data); });
    const ch = supabase.channel("audit-log").on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log" }, (p) => {
      const row = p.new as AuditEntry;
      setEntries((e) => (e.some((x) => x.id === row.id) ? e : [row, ...e]));
    }).subscribe();
    return () => { live = false; supabase.removeChannel(ch); };
  }, [uid]);

  useEffect(() => {
    const fresh = localLog.slice(0, Math.max(0, localLog.length - seen.current)).reverse();
    seen.current = localLog.length;
    if (!fresh.length) return;
    if (!uid) { setUnsaved((n) => n + fresh.length); return; }
    supabase.from("audit_log").insert(fresh.map((l) => ({ action: l.slice(9) }))).select("id,actor_name,actor_email,action,created_at")
      .then(({ data, error }) => {
        if (error) { setUnsaved((n) => n + fresh.length); return; }
        if (data) setEntries((e) => [...data.filter((r) => !e.some((x) => x.id === r.id)).reverse(), ...e]);
      });
  }, [localLog, uid]);

  return { entries, unsaved };
}

export function AuditLogModule({ entries, unsaved, signedIn }: { entries: AuditEntry[]; unsaved: number; signedIn: boolean }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category>("ALL");
  const all = useMemo(() => entries.map((e) => ({ ...e, cat: categorize(e.action) })), [entries]);
  const rows = useMemo(() => {
    const n = q.toLowerCase();
    return all.filter((r) => (cat === "ALL" || r.cat === cat) && (!n || r.action.toLowerCase().includes(n) || r.actor_name.toLowerCase().includes(n) || r.actor_email.toLowerCase().includes(n)));
  }, [all, q, cat]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    all.forEach((r) => { c[r.cat] = (c[r.cat] ?? 0) + 1; });
    return c;
  }, [all]);
  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = ["seq,timestamp_utc,actor,actor_email,category,action", ...rows.map((r) => [r.id, r.created_at, esc(r.actor_name), esc(r.actor_email), r.cat, esc(r.action)].join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `nyumbahub-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex h-full flex-col border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="font-mono text-[11px] font-bold uppercase">Ops Audit Log <span className="text-muted-foreground">· {entries.length} recorded events</span></div>
        <div className="flex items-center gap-1">
          <div className="flex items-center border border-border px-2"><Search className="h-3 w-3 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter actions or admins…" className="h-7 bg-transparent px-2 font-mono text-xs outline-none" /></div>
          <button className="btn-secondary flex items-center gap-1" disabled={!rows.length} onClick={exportCsv}><Download className="h-3 w-3" />Export CSV</button>
        </div>
      </div>
      {(!signedIn || unsaved > 0) && (
        <div className="border-b border-border bg-active-soft px-3 py-1.5 font-mono text-[10px] text-primary">
          {!signedIn ? "SIGN IN THROUGH MAIL TO VIEW THE LOG AND RECORD ACTIONS UNDER YOUR NAME." : ""} {unsaved > 0 ? `${unsaved} ACTION(S) PERFORMED WHILE SIGNED OUT WERE NOT RECORDED.` : ""}
        </div>
      )}
      <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`border px-2 py-0.5 font-mono text-[10px] ${cat === c ? "border-active bg-active-soft font-bold text-primary" : "border-border"}`}>
            {c} <span className="text-muted-foreground">{c === "ALL" ? all.length : counts[c] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted font-mono text-[10px] uppercase text-muted-foreground">
            <tr><th className="px-3 py-1.5 text-left">#</th><th className="px-3 py-1.5 text-left">Time (UTC)</th><th className="px-3 py-1.5 text-left">Admin</th><th className="px-3 py-1.5 text-left">Category</th><th className="px-3 py-1.5 text-left">Action</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border-subtle">
                <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.id}</td>
                <td className="px-3 py-1.5 font-mono">{r.created_at.slice(0, 19).replace("T", " ")}</td>
                <td className="px-3 py-1.5"><div>{r.actor_name || "—"}</div><div className="font-mono text-[10px] text-muted-foreground">{r.actor_email}</div></td>
                <td className="px-3 py-1.5"><span className="badge">{r.cat}</span></td>
                <td className="px-3 py-1.5 font-mono">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="py-10 text-center font-mono text-[11px] text-muted-foreground">{entries.length ? "NO EVENTS MATCH THIS FILTER" : signedIn ? "NO ACTIONS RECORDED YET" : "SIGN IN TO VIEW THE AUDIT LOG"}</div>}
      </div>
      <div className="flex items-center gap-1 border-t border-border px-3 py-1.5 font-mono text-[10px] text-muted-foreground"><Lock className="h-3 w-3" />Permanent, shared across admins · entries cannot be edited or deleted</div>
    </div>
  );
}
