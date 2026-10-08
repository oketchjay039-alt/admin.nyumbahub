import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Copy } from "lucide-react";
import { triageTicketFn } from "@/lib/ticket-triage.functions";

type Result = { summary: string; priority: "P1" | "P2" | "P3"; rationale: string; reply: string };

export function TicketTriage({ ticketId, initial, onApplyPriority }: { ticketId: string; initial: string; onApplyPriority: (p: string) => void }) {
  const run = useServerFn(triageTicketFn);
  const [msg, setMsg] = useState(initial);
  const [res, setRes] = useState<Result | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setMsg(initial); setRes(null); setErr(null); setReply(""); }, [ticketId, initial]);

  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await run({ data: { message: msg } });
      setRes(r); setReply(r.reply);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "AI triage failed.");
    } finally { setBusy(false); }
  };

  const tone = res?.priority === "P1" ? "badge-bad" : res?.priority === "P2" ? "badge-warn" : "badge-ok";

  return (
    <div className="space-y-2 border border-border p-2">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Sparkles className="h-3 w-3" /> AI Triage</div>
      <textarea className="field h-24 w-full resize-none font-mono text-xs" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Paste the customer's message…" />
      <button className="btn-primary w-full" disabled={busy || msg.trim().length < 5} onClick={go}>{busy ? "Analysing…" : "Summarise, prioritise & draft reply"}</button>
      {err && <div className="border border-border bg-muted p-2 text-xs text-destructive">{err}</div>}
      {res && <>
        <div className="text-xs"><span className="font-semibold">Summary: </span>{res.summary}</div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`badge ${tone}`}>{res.priority}</span>
          <span className="text-muted-foreground">{res.rationale}</span>
        </div>
        <button className="btn-secondary w-full" onClick={() => onApplyPriority(res.priority)}>Apply priority {res.priority}</button>
        <textarea className="field h-32 w-full resize-none text-xs" value={reply} onChange={(e) => setReply(e.target.value)} />
        <button className="btn-secondary flex w-full items-center justify-center gap-1" onClick={() => navigator.clipboard.writeText(reply)}><Copy className="h-3 w-3" /> Copy reply</button>
      </>}
    </div>
  );
}
