import { useMemo, useState } from "react";
import { Download, Search, Trash2 } from "lucide-react";

const CATEGORIES = ["ALL", "KYC", "LISTING", "PAYMENT", "PAYOUT", "TICKET", "SETTINGS"] as const;
type Category = (typeof CATEGORIES)[number];

function categorize(msg: string): Exclude<Category, "ALL"> | "OTHER" {
  if (msg.startsWith("KYC")) return "KYC";
  if (msg.startsWith("LISTING")) return "LISTING";
  if (msg.startsWith("DARAJA")) return "PAYMENT";
  if (msg.startsWith("B2C")) return "PAYOUT";
  if (msg.startsWith("TKT")) return "TICKET";
  if (msg.startsWith("SETTINGS")) return "SETTINGS";
  return "OTHER";
}

export function AuditLogModule({ log, onClear }: { log: string[]; onClear: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category>("ALL");
  const rows = useMemo(
    () =>
      log
        .map((l, i) => ({ seq: log.length - i, time: l.slice(0, 8), action: l.slice(9), cat: categorize(l.slice(9)) }))
        .filter((r) => (cat === "ALL" || r.cat === cat) && (!q || r.action.toLowerCase().includes(q.toLowerCase()))),
    [log, q, cat],
  );
  const exportCsv = () => {
    const csv = ["seq,time_utc,category,action", ...rows.map((r) => `${r.seq},${r.time},${r.cat},"${r.action.replace(/"/g, '""')}"`)].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `nyumbahub-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    log.forEach((l) => { const k = categorize(l.slice(9)); c[k] = (c[k] ?? 0) + 1; });
    return c;
  }, [log]);

  return (
    <div className="flex h-full flex-col border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="font-mono text-[11px] font-bold uppercase">Ops Audit Log <span className="text-muted-foreground">· {log.length} events this session</span></div>
        <div className="flex items-center gap-1">
          <div className="flex items-center border border-border px-2"><Search className="h-3 w-3 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter actions…" className="h-7 bg-transparent px-2 font-mono text-xs outline-none" /></div>
          <button className="btn-secondary flex items-center gap-1" disabled={!rows.length} onClick={exportCsv}><Download className="h-3 w-3" />Export CSV</button>
          <button className="btn-danger flex items-center gap-1" disabled={!log.length} onClick={() => { if (confirm("Clear this session's audit log?")) onClear(); }}><Trash2 className="h-3 w-3" />Clear</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`border px-2 py-0.5 font-mono text-[10px] ${cat === c ? "border-active bg-active-soft font-bold text-primary" : "border-border"}`}>
            {c} <span className="text-muted-foreground">{c === "ALL" ? log.length : counts[c] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted font-mono text-[10px] uppercase text-muted-foreground">
            <tr><th className="px-3 py-1.5 text-left">#</th><th className="px-3 py-1.5 text-left">Time (UTC)</th><th className="px-3 py-1.5 text-left">Category</th><th className="px-3 py-1.5 text-left">Action</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.seq} className="border-b border-border-subtle">
                <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.seq}</td>
                <td className="px-3 py-1.5 font-mono">{r.time}</td>
                <td className="px-3 py-1.5"><span className="badge">{r.cat}</span></td>
                <td className="px-3 py-1.5 font-mono">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="py-10 text-center font-mono text-[11px] text-muted-foreground">{log.length ? "NO EVENTS MATCH THIS FILTER" : "NO ACTIONS YET — APPROVE A KYC, PUBLISH A LISTING OR DISBURSE A PAYOUT TO SEE IT HERE"}</div>}
      </div>
      <div className="border-t border-border px-3 py-1.5 font-mono text-[10px] text-muted-foreground">Session-only log · resets on reload · not yet stored centrally</div>
    </div>
  );
}
