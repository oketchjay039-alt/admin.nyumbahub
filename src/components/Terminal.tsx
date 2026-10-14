import { useMemo, useReducer, useState, type ReactNode } from "react";
import { Activity, BadgeCheck, Building2, CalendarRange, LifeBuoy, Search, Wallet, ChevronLeft, ChevronRight, RefreshCw, FileText, Image as ImageIcon, Settings, PanelLeftClose, PanelLeftOpen, Inbox, Send, Mail, ScrollText, ChevronDown } from "lucide-react";
import { AuditLogModule } from "@/components/AuditLogModule";
import { useMail } from "@/components/mail/useMail";
import { MailCenter } from "@/components/mail/MailCenter";
import { Button } from "@/components/ui/button";
import { TerminalSettings, LiveClock, DEFAULT_PREFERENCES, type TerminalPreferences } from "@/components/TerminalSettings";
import { TicketTriage } from "@/components/TicketTriage";
import { COUNTIES, PAYMENTS, KYCS, PROPERTIES, PAYOUTS, TICKETS, kes, statusTone, type Payment, type Kyc, type Property, type Payout, type Ticket } from "@/lib/terminal-data";

type ModuleKey = "overview" | "kyc" | "property" | "shortstay" | "mpesa" | "tickets" | "inbox" | "outbox" | "audit" | "settings";

const NAV: { key: ModuleKey; label: string; icon: typeof Activity; group?: "mail" }[] = [
  { key: "overview", label: "Executive Overview", icon: Activity },
  { key: "kyc", label: "Identity & KYC Queue", icon: BadgeCheck },
  { key: "property", label: "Property Moderation", icon: Building2 },
  { key: "shortstay", label: "Short-Stay Ledger", icon: CalendarRange },
  { key: "mpesa", label: "M-Pesa Financials", icon: Wallet },
  { key: "tickets", label: "Support & Ticketing", icon: LifeBuoy },
  { key: "inbox", label: "Inbox", icon: Inbox, group: "mail" },
  { key: "outbox", label: "Outbox", icon: Send, group: "mail" },
  { key: "audit", label: "Ops Audit Log", icon: ScrollText },
  { key: "settings", label: "Settings", icon: Settings },
];

interface State {
  module: ModuleKey;
  payments: Payment[]; kycs: Kyc[]; properties: Property[]; payouts: Payout[]; tickets: Ticket[];
  selected: Record<ModuleKey, string | null>;
  page: Record<ModuleKey, number>;
  log: string[];
}
type Action =
  | { t: "module"; m: ModuleKey }
  | { t: "select"; m: ModuleKey; id: string }
  | { t: "page"; m: ModuleKey; p: number }
  | { t: "kyc"; id: string; status: string; reason?: string }
  | { t: "prop"; id: string; status: string }
  | { t: "commission"; id: string; pct: number }
  | { t: "payout"; id: string }
  | { t: "payment"; id: string; status: string }
  | { t: "ticket"; id: string; status: string }
  | { t: "ticketPri"; id: string; priority: string }
  | { t: "log"; msg: string }
  | { t: "clearLog" };

const stamp = () => new Date().toISOString().slice(11, 19);
const upd = <T extends { id: string }>(arr: T[], id: string, patch: Partial<T>) => arr.map((r) => (r.id === id ? { ...r, ...patch } : r));

function reducer(s: State, a: Action): State {
  const log = (msg: string) => [`${stamp()} ${msg}`, ...s.log].slice(0, 500);
  switch (a.t) {
    case "module": return { ...s, module: a.m };
    case "select": return { ...s, selected: { ...s.selected, [a.m]: a.id } };
    case "page": return { ...s, page: { ...s.page, [a.m]: a.p } };
    case "kyc": return { ...s, kycs: upd(s.kycs, a.id, { status: a.status, reason: a.reason }), log: log(`KYC ${a.id.slice(0, 8)} -> ${a.status}`) };
    case "prop": return { ...s, properties: upd(s.properties, a.id, { status: a.status }), log: log(`LISTING ${a.id.slice(0, 8)} -> ${a.status}`) };
    case "commission": return { ...s, payouts: upd(s.payouts, a.id, { commission: a.pct }) };
    case "payout": return { ...s, payouts: upd(s.payouts, a.id, { status: "COMPLETED" }), log: log(`B2C DISBURSED ${a.id.slice(0, 8)}`) };
    case "payment": return { ...s, payments: upd(s.payments, a.id, { status: a.status }), log: log(`DARAJA RE-QUERY ${a.id.slice(0, 8)} -> ${a.status}`) };
    case "ticket": return { ...s, tickets: upd(s.tickets, a.id, { status: a.status }), log: log(`${a.id} -> ${a.status}`) };
    case "ticketPri": return { ...s, tickets: upd(s.tickets, a.id, { priority: a.priority }), log: log(`${a.id} PRIORITY -> ${a.priority} (AI)`) };
    case "log": return { ...s, log: log(a.msg) };
    case "clearLog": return { ...s, log: [] };
  }
}

const init: State = {
  module: "overview", payments: PAYMENTS, kycs: KYCS, properties: PROPERTIES, payouts: PAYOUTS, tickets: TICKETS,
  selected: { overview: PAYMENTS[0]?.id ?? null, kyc: KYCS[0]?.id ?? null, property: PROPERTIES[0]?.id ?? null, shortstay: null, mpesa: PAYOUTS[0]?.id ?? null, tickets: TICKETS[0]?.id ?? null, inbox: null, outbox: null, audit: null, settings: null },
  page: { overview: 0, kyc: 0, property: 0, shortstay: 0, mpesa: 0, tickets: 0, inbox: 0, outbox: 0, audit: 0, settings: 0 },
  log: [],
};

function Badge({ s }: { s: string }) {
  const t = statusTone(s);
  return <span className={`badge ${t === "ok" ? "badge-ok" : t === "bad" ? "badge-bad" : "badge-warn"}`}>{s}</span>;
}

interface Col<T> { h: string; r: (row: T) => ReactNode; mono?: boolean; right?: boolean }

function Grid<T extends { id: string }>({ title, rows, cols, selected, onSelect, page, onPage }: { title: string; rows: T[]; cols: Col<T>[]; selected: string | null; onSelect: (id: string) => void; page: number; onPage: (p: number) => void }) {
  const per = 25;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const p = Math.min(page, pages - 1);
  const slice = rows.slice(p * per, p * per + per);
  return (
    <div className="flex h-full min-h-0 flex-col border border-border bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider">{title}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{rows.length} RECORDS</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>{cols.map((c) => <th key={c.h} className={`border-b border-border px-3 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${c.right ? "text-right" : ""}`}>{c.h}</th>)}</tr>
          </thead>
          <tbody>
            {slice.map((row) => {
              const on = row.id === selected;
              return (
                <tr key={row.id} onClick={() => onSelect(row.id)} className={`cursor-pointer border-b border-border-subtle ${on ? "bg-active-soft outline outline-1 -outline-offset-1 outline-active" : "hover:bg-muted"}`}>
                  {cols.map((c) => <td key={c.h} className={`whitespace-nowrap px-3 py-1.5 ${c.mono ? "font-mono" : ""} ${c.right ? "text-right" : ""}`}>{c.r(row)}</td>)}
                </tr>
              );
            })}
            {slice.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-6 text-center font-mono text-muted-foreground">NO RECORDS MATCH CURRENT FILTER</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex h-9 shrink-0 items-center justify-between border-t border-border bg-muted px-3">
        <span className="font-mono text-[11px] text-muted-foreground">ROWS {rows.length ? p * per + 1 : 0}–{Math.min(rows.length, p * per + per)} / {rows.length}</span>
        <div className="flex items-center gap-1">
          <button className="btn-secondary !px-2 !py-1" disabled={p === 0} onClick={() => onPage(p - 1)}><ChevronLeft className="h-3 w-3" /></button>
          <span className="px-2 font-mono text-[11px]">PG {p + 1}/{pages}</span>
          <button className="btn-secondary !px-2 !py-1" disabled={p >= pages - 1} onClick={() => onPage(p + 1)}><ChevronRight className="h-3 w-3" /></button>
        </div>
      </div>
    </div>
  );
}

function Meta({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="border border-border">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[110px_1fr] border-b border-border-subtle last:border-b-0">
          <dt className="bg-muted px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground">{k}</dt>
          <dd className="break-all px-2 py-1 font-mono text-[11px]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Inspector({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col border border-border bg-card">
      <div className="flex h-9 shrink-0 items-center border-b border-border px-3 font-mono text-[11px] font-bold uppercase tracking-wider">RECORD INSPECTOR :: {title}</div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">{children}</div>
    </div>
  );
}

const Section = ({ h }: { h: string }) => <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{h}</div>;

export function Terminal() {
  const mail = useMail();
  const me = mail.me ? { full_name: mail.me.full_name, isSuperAdmin: mail.isSuperAdmin } : null;
  const [s, d] = useReducer(reducer, init);
  const [q, setQ] = useState("");
  const [county, setCounty] = useState("Nairobi County");
  const [allCounties, setAllCounties] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mailOpen, setMailOpen] = useState(true);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const applyPreferences = (next: TerminalPreferences) => {
    setPreferences(next);
    setCounty(next.county);
    setAllCounties(next.allCounties);
    d({ t: "log", msg: "SETTINGS SESSION PREFERENCES APPLIED" });
  };

  const match = (r: object & { county?: string }) => {
    if (!allCounties && r.county && r.county !== county) return false;
    if (!q) return true;
    const n = q.toLowerCase().replace(/\s/g, "");
    return Object.values(r).some((v) => typeof v === "string" && v.toLowerCase().replace(/\s/g, "").includes(n));
  };

  const payments = useMemo(() => s.payments.filter(match), [s.payments, q, county, allCounties]);
  const kycs = useMemo(() => s.kycs.filter(match), [s.kycs, q, county, allCounties]);
  const props = useMemo(() => s.properties.filter(match), [s.properties, q, county, allCounties]);
  const shortstay = useMemo(() => s.properties.filter((p) => p.type === "Short-stay").filter(match), [s.properties, q, county, allCounties]);
  const payouts = useMemo(() => s.payouts.filter(match), [s.payouts, q, county, allCounties]);
  const tickets = useMemo(() => s.tickets.filter(match), [s.tickets, q, county, allCounties]);

  const pendingKyc = s.kycs.filter((k) => k.status === "PENDING").length;
  const m = s.module;
  const sel = s.selected[m];
  const gridProps = { selected: sel, onSelect: (id: string) => { d({ t: "select", m, id }); setReason(""); }, page: s.page[m], onPage: (p: number) => d({ t: "page", m, p }) };

  const simulate = (key: string, fn: () => void) => { setBusy(key); setTimeout(() => { fn(); setBusy(null); }, 700); };

  let grid: ReactNode = null;
  let inspector: ReactNode = null;

  if (m === "overview") {
    grid = <Grid title="Real-Time M-Pesa Payment Stream" rows={payments} {...gridProps} cols={[
      { h: "Timestamp", r: (r) => r.ts, mono: true },
      { h: "Receipt", r: (r) => <span className="font-semibold">{r.receipt}</span>, mono: true },
      { h: "Phone", r: (r) => r.phone, mono: true },
      { h: "Amount", r: (r) => kes(r.amount), mono: true, right: true },
      { h: "Type", r: (r) => r.type },
      { h: "Status", r: (r) => <Badge s={r.status} /> },
    ]} />;
    const p = s.payments.find((x) => x.id === sel);
    inspector = <Inspector title="Daraja Callback">{p ? <>
      <Meta rows={[["Receipt", p.receipt], ["Payer", p.name], ["MSISDN", p.phone], ["Amount", kes(p.amount)], ["MerchantReq", p.merchantId], ["CheckoutReq", p.checkoutId], ["Status", <Badge s={p.status} />]]} />
      <Section h="Raw stkCallback payload" />
      <pre className="overflow-auto bg-code p-2 font-mono text-[10px] leading-snug text-code-foreground">{JSON.stringify({ Body: { stkCallback: { MerchantRequestID: p.merchantId, CheckoutRequestID: p.checkoutId, ResultCode: p.status === "COMPLETED" ? 0 : p.status === "FAILED" ? 1032 : 1037, ResultDesc: p.status === "COMPLETED" ? "The service request is processed successfully." : p.status === "FAILED" ? "Request cancelled by user" : "DS timeout user cannot be reached", CallbackMetadata: { Item: [{ Name: "Amount", Value: p.amount }, { Name: "MpesaReceiptNumber", Value: p.receipt }, { Name: "TransactionDate", Value: Number(p.ts.replace(/\D/g, "")) }, { Name: "PhoneNumber", Value: Number(p.phone.replace(/\D/g, "")) }] } } } }, null, 2)}</pre>
      <button className="btn-primary flex w-full items-center justify-center gap-2" disabled={busy === p.id} onClick={() => simulate(p.id, () => d({ t: "payment", id: p.id, status: p.status === "PENDING" ? "COMPLETED" : p.status }))}>
        <RefreshCw className={`h-3 w-3 ${busy === p.id ? "animate-spin" : ""}`} />{busy === p.id ? "QUERYING..." : "Re-Query Daraja Gateway"}
      </button>
    </> : <Empty />}</Inspector>;
  }

  if (m === "kyc") {
    grid = <Grid title="User Verification Submissions" rows={kycs} {...gridProps} cols={[
      { h: "User Name", r: (r) => r.name },
      { h: "Phone", r: (r) => r.phone, mono: true },
      { h: "Document", r: (r) => r.doc },
      { h: "County", r: (r) => r.county },
      { h: "Submitted", r: (r) => r.submitted, mono: true },
      { h: "Status", r: (r) => <Badge s={r.status} /> },
    ]} />;
    const k = s.kycs.find((x) => x.id === sel);
    inspector = <Inspector title="KYC Review">{k ? <>
      <div className="relative flex h-36 flex-col justify-between border-2 border-foreground bg-muted p-2">
        <div className="flex justify-between font-mono text-[9px] font-bold uppercase"><span>Republic of Kenya</span><span>{k.doc}</span></div>
        <div className="flex gap-2">
          <div className="flex h-16 w-14 items-center justify-center border border-foreground bg-card"><FileText className="h-5 w-5 text-muted-foreground" /></div>
          <div className="space-y-0.5 font-mono text-[10px]"><div>NAME: {k.name.toUpperCase()}</div><div>ID NO: {k.idNumber}</div><div>DISTRICT: {k.county.toUpperCase()}</div></div>
        </div>
        <div className="font-mono text-[8px] tracking-widest text-muted-foreground">IDKEN{k.idNumber}&lt;&lt;{k.name.toUpperCase().replace(" ", "<<")}&lt;&lt;&lt;</div>
      </div>
      <Meta rows={[["UUID", k.id], ["MSISDN", k.phone], ["Submitted", k.submitted], ["Status", <Badge s={k.status} />], ...(k.reason ? [["Reason", k.reason] as [string, string]] : [])]} />
      <Section h="Rejection reason (mandatory to reject)" />
      <textarea className="field h-16 w-full resize-none font-mono" placeholder="e.g. Document blurred, name mismatch with IPRS record" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-primary" disabled={k.status === "APPROVED"} onClick={() => d({ t: "kyc", id: k.id, status: "APPROVED" })}>Approve Verification</button>
        <button className="btn-danger" disabled={!reason.trim()} onClick={() => { d({ t: "kyc", id: k.id, status: "REJECTED", reason: reason.trim() }); setReason(""); }}>Reject With Reason</button>
      </div>
    </> : <Empty />}</Inspector>;
  }

  if (m === "property" || m === "shortstay") {
    const rows = m === "property" ? props : shortstay;
    grid = <Grid title={m === "property" ? "Multi-County Listing Approvals" : "Short-Stay Listing Ledger"} rows={rows} {...gridProps} cols={[
      { h: "Property Title", r: (r) => r.title },
      { h: "Owner", r: (r) => r.owner },
      { h: "Location", r: (r) => r.location },
      { h: "Category", r: (r) => r.category },
      { h: "Price", r: (r) => kes(r.price) + (r.type === "Short-stay" ? "/nt" : r.type === "Rent" ? "/mo" : ""), mono: true, right: true },
      { h: "Type", r: (r) => r.type },
      { h: "Status", r: (r) => <Badge s={r.status} /> },
    ]} />;
    const p = s.properties.find((x) => x.id === (sel ?? rows[0]?.id));
    const total = p ? Math.round((p.score.docs + p.score.photos + p.score.geo + p.score.owner) / 4) : 0;
    inspector = <Inspector title="Listing">{p ? <>
      <div className="grid grid-cols-3 gap-1">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="flex aspect-square items-center justify-center border border-border bg-muted"><ImageIcon className="h-4 w-4 text-muted-foreground" /><span className="ml-1 font-mono text-[9px] text-muted-foreground">IMG_{i + 1}</span></div>)}</div>
      <Meta rows={[["UUID", p.id], ["Owner", p.owner], ["Location", p.location], ["Price", kes(p.price)], ["Status", <Badge s={p.status} />]]} />
      <Section h={`Verification score :: ${total}/100`} />
      <div className="space-y-1">{Object.entries(p.score).map(([k, v]) => (
        <div key={k} className="grid grid-cols-[70px_1fr_32px] items-center gap-2 font-mono text-[10px] uppercase">
          <span>{k}</span><div className="h-2 border border-border bg-muted"><div className={`h-full ${v > 75 ? "bg-ok-strong" : v > 55 ? "bg-warn-strong" : "bg-bad"}`} style={{ width: `${v}%` }} /></div><span className="text-right">{v}</span>
        </div>))}</div>
      <div className="grid grid-cols-1 gap-2">
        <button className="btn-primary" disabled={p.status === "ACTIVE"} onClick={() => d({ t: "prop", id: p.id, status: "ACTIVE" })}>Publish Listing</button>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-danger" onClick={() => d({ t: "prop", id: p.id, status: "DUPLICATE" })}>Flag Duplicate</button>
          <button className="btn-secondary" onClick={() => d({ t: "prop", id: p.id, status: "ARCHIVED" })}>Archive</button>
        </div>
      </div>
    </> : <Empty />}</Inspector>;
  }

  if (m === "mpesa") {
    grid = <Grid title="Escrow Balances & Host Disbursement Queue" rows={payouts} {...gridProps} cols={[
      { h: "Host Name", r: (r) => r.host },
      { h: "M-Pesa Phone", r: (r) => r.phone, mono: true },
      { h: "Booking Ref", r: (r) => r.ref.slice(0, 18) + "…", mono: true },
      { h: "Gross", r: (r) => kes(r.gross), mono: true, right: true },
      { h: "Commission", r: (r) => kes((r.gross * r.commission) / 100), mono: true, right: true },
      { h: "Net Payable", r: (r) => <span className="font-semibold">{kes(r.gross * (1 - r.commission / 100))}</span>, mono: true, right: true },
      { h: "Payout Status", r: (r) => <Badge s={r.status} /> },
    ]} />;
    const p = s.payouts.find((x) => x.id === sel);
    inspector = <Inspector title="B2C Payout">{p ? <>
      <Meta rows={[["Host", p.host], ["MSISDN", p.phone], ["Booking Ref", p.ref], ["Gross", kes(p.gross)], ["Commission", `${p.commission.toFixed(1)}% :: ${kes((p.gross * p.commission) / 100)}`], ["Net", kes(p.gross * (1 - p.commission / 100))], ["Status", <Badge s={p.status} />]]} />
      <Section h="Adjust commission %" />
      <div className="flex items-center gap-2">
        <input type="range" min={0} max={25} step={0.5} value={p.commission} disabled={p.status === "COMPLETED"} onChange={(e) => d({ t: "commission", id: p.id, pct: Number(e.target.value) })} className="flex-1 accent-primary" />
        <input type="number" min={0} max={25} step={0.5} value={p.commission} disabled={p.status === "COMPLETED"} onChange={(e) => d({ t: "commission", id: p.id, pct: Math.min(25, Math.max(0, Number(e.target.value))) })} className="field w-16 font-mono" />
      </div>
      <div className="border border-primary-border bg-active-soft p-2.5">
        <div className="font-mono text-[10px] uppercase text-muted-foreground">Net disbursement</div>
        <div className="font-mono text-lg font-bold text-primary">{kes(p.gross * (1 - p.commission / 100))}</div>
      </div>
      <button className="btn-primary w-full !py-2.5" disabled={p.status === "COMPLETED" || busy === p.id} onClick={() => simulate(p.id, () => d({ t: "payout", id: p.id }))}>{busy === p.id ? "SUBMITTING B2C REQUEST..." : p.status === "COMPLETED" ? "DISBURSED" : "Trigger M-Pesa B2C Disbursement"}</button>
    </> : <Empty />}</Inspector>;
  }

  if (m === "tickets") {
    grid = <Grid title="Support Ticket Queue" rows={tickets} {...gridProps} cols={[
      { h: "Ticket", r: (r) => r.id, mono: true },
      { h: "Subject", r: (r) => r.subject },
      { h: "User", r: (r) => r.user },
      { h: "Phone", r: (r) => r.phone, mono: true },
      { h: "Pri", r: (r) => <span className={`badge ${r.priority === "P1" ? "badge-bad" : r.priority === "P2" ? "badge-warn" : "badge-ok"}`}>{r.priority}</span> },
      { h: "Channel", r: (r) => r.channel },
      { h: "Opened", r: (r) => r.opened, mono: true },
      { h: "Status", r: (r) => <Badge s={r.status} /> },
    ]} />;
    const t = s.tickets.find((x) => x.id === sel);
    inspector = <Inspector title="Ticket">{t ? <>
      <Meta rows={[["Ticket", t.id], ["User", t.user], ["MSISDN", t.phone], ["Channel", t.channel], ["Opened", t.opened], ["Status", <Badge s={t.status} />]]} />
      <Section h="Subject" /><div className="text-xs font-semibold">{t.subject}</div>
      <p className="border border-border bg-muted p-2 text-xs">{t.body}</p>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary" onClick={() => d({ t: "ticket", id: t.id, status: "IN_REVIEW" })}>Escalate</button>
        <button className="btn-primary" disabled={t.status === "RESOLVED"} onClick={() => d({ t: "ticket", id: t.id, status: "RESOLVED" })}>Resolve</button>
      </div>
      <TicketTriage ticketId={t.id} initial={`${t.subject}\n\n${t.body}`} onApplyPriority={(p) => d({ t: "ticketPri", id: t.id, priority: p })} />
    </> : <Empty />}</Inspector>;
  }

  return (
    <div data-density={preferences.density} className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-topbar-border bg-topbar px-3 py-2 text-topbar-foreground">
        <div className="flex items-center gap-2"><Button variant="ghost" size="icon" className="h-7 w-7 text-topbar-accent hover:bg-topbar-border hover:text-topbar-accent" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button><span className="whitespace-nowrap font-mono text-xs font-bold text-topbar-accent">NYUMBAHUB <span className="hidden 2xl:inline">:: CONTROL TERMINAL</span></span></div>
        <div className="flex max-w-md flex-1 items-center border border-topbar-border bg-topbar px-2">
          <Search className="h-3.5 w-3.5 text-topbar-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search M-Pesa code, phone, UUID, name…" className="h-7 w-full bg-transparent px-2 font-mono text-xs text-topbar-foreground outline-none placeholder:text-topbar-muted" />
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 font-mono text-[10px] text-topbar-muted"><input type="checkbox" checked={!allCounties} onChange={(e) => setAllCounties(!e.target.checked)} className="accent-topbar-accent" />SCOPE</label>
          <select value={county} onChange={(e) => { setCounty(e.target.value); setAllCounties(false); }} className="h-7 border border-topbar-border bg-topbar px-2 font-mono text-xs text-topbar-foreground outline-none">
            {COUNTIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <span className="hidden whitespace-nowrap border border-topbar-accent px-2 py-0.5 font-mono text-[11px] text-topbar-accent xl:block">[{me?.isSuperAdmin ? "SUPER_ADMIN" : "SYS_ADMIN"} :: {(me?.full_name ?? "ELIJA JUMA").toUpperCase().replace(/\s+/g, "_")}]</span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Modules" className={`flex shrink-0 flex-col justify-between border-r border-border bg-card ${collapsed ? "w-14" : "w-56"}`}>
          <div className="min-h-0 overflow-y-auto">
            {NAV.map(({ key, label, icon: Icon, group }) => {
              if (group === "mail" && key === "outbox") return null;
              if (group === "mail") {
                const inMail = m === "inbox" || m === "outbox";
                return (
                  <div key="mail">
                    <Button variant="ghost" aria-label="Mail" aria-expanded={mailOpen} title={collapsed ? "Mail" : undefined} onClick={() => { setMailOpen(!mailOpen || !inMail); if (!inMail) d({ t: "module", m: "inbox" }); }} className={`h-11 w-full gap-3 border-b border-border-subtle px-3 text-left text-xs ${collapsed ? "justify-center" : "justify-start"} ${inMail ? "font-semibold text-primary" : "hover:bg-muted"}`}>
                      <span className="relative shrink-0"><Mail className="h-4 w-4" />{mail.unread > 0 && <span aria-label={`${mail.unread} unread`} className="absolute -right-2 -top-2 min-w-4 bg-active px-1 text-center font-mono text-[9px] font-bold leading-4 text-primary-foreground">{mail.unread > 99 ? "99+" : mail.unread}</span>}</span>
                      {!collapsed && <>Mail<ChevronDown className={`ml-auto h-3 w-3 transition-transform ${mailOpen ? "" : "-rotate-90"}`} /></>}
                    </Button>
                    {mailOpen && (["inbox", "outbox"] as const).map((sub) => {
                      const SubIcon = sub === "inbox" ? Inbox : Send;
                      const subLabel = sub === "inbox" ? "Inbox" : "Outbox";
                      return (
                        <Button key={sub} variant="ghost" aria-label={subLabel} aria-current={m === sub ? "page" : undefined} title={collapsed ? subLabel : undefined} onClick={() => d({ t: "module", m: sub })} className={`h-9 w-full gap-3 border-b border-border-subtle text-left text-xs ${collapsed ? "justify-center px-3" : "justify-start pl-9 pr-3"} ${m === sub ? "border-l-2 border-l-active bg-active-soft font-semibold text-primary" : "hover:bg-muted"}`}>
                          <SubIcon className="h-3.5 w-3.5 shrink-0" />{!collapsed && subLabel}
                          {!collapsed && sub === "inbox" && mail.unread > 0 && <span className="ml-auto font-mono text-[10px] font-bold text-active">{mail.unread} NEW</span>}
                        </Button>
                      );
                    })}
                  </div>
                );
              }
              return (
              <Button key={key} variant="ghost" aria-label={label} aria-current={m === key ? "page" : undefined} title={collapsed ? label : undefined} onClick={() => d({ t: "module", m: key })} className={`h-11 w-full gap-3 border-b border-border-subtle px-3 text-left text-xs ${collapsed ? "justify-center" : "justify-start"} ${m === key ? "border-l-2 border-l-active bg-active-soft font-semibold text-primary" : "hover:bg-muted"}`}>
                <Icon className="h-4 w-4 shrink-0" />{!collapsed && label}{!collapsed && key === "audit" && s.log.length > 0 && <span className="ml-auto font-mono text-[10px] text-muted-foreground">{s.log.length}</span>}
              </Button>
              );
            })}
</div>
            </div>}
          </div>
          <div className="shrink-0"><LiveClock timezone={preferences.timezone} hour12={preferences.hour12} collapsed={collapsed} /><div title="Demo gateway status" className="flex items-center justify-center gap-2 border-t border-border p-3 font-mono text-[10px]"><span className="h-2 w-2 bg-warn-strong" />{!collapsed && "DARAJA · DEMO"}</div></div>
        </nav>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {m === "audit" ? <div className="min-h-0 flex-1 p-3"><AuditLogModule log={s.log} onClear={() => d({ t: "clearLog" })} /></div> : m === "inbox" || m === "outbox" ? <div className="min-h-0 flex-1 p-3"><MailCenter mail={mail} folder={m} /></div> : m === "settings" ? <div className="min-h-0 flex-1 p-3"><TerminalSettings value={preferences} onApply={applyPreferences} /></div> : <>
          <div className="grid h-16 shrink-0 grid-cols-4 gap-3 bg-background p-3 pb-0 box-content">
            <Kpi l="Active Properties" v="14,280" s="47 Counties Active" c="text-foreground" />
            <Kpi l="Gross Revenue (MTD)" v="KES 48,250,000.00" s="M-Pesa STK + Card" c="text-primary" />
            <Kpi l="Pending KYC Queue" v={`${pendingKyc} UNREVIEWED`} s="SLA: < 2 Hours" c="text-warn-strong" />
            <Kpi l="Gateway Health" v="99.4% SUCCESS" s="Daraja B2C/STK Rails" c="text-ok" />
          </div>
          <div className="flex min-h-0 flex-1 gap-3 p-3">
            <div className="min-h-0 w-[70%] min-w-0">{grid}</div>
            <div className="min-h-0 min-w-0 flex-1">{inspector}</div>
          </div>
          </>}
        </main>
      </div>
    </div>
  );
}

function Kpi({ l, v, s, c }: { l: string; v: string; s: string; c: string }) {
  return (
    <div className="flex flex-col justify-center border border-border bg-card p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{l}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{s}</span>
      </div>
      <div className={`font-mono text-lg font-bold leading-tight ${c}`}>{v}</div>
    </div>
  );
}

function Empty() {
  return <div className="py-10 text-center font-mono text-[11px] text-muted-foreground">SELECT A ROW TO INSPECT</div>;
}
