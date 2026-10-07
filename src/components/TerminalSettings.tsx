import { useEffect, useState } from "react";
import { Bell, Building2, Clock3, Globe2, Monitor, RotateCcw, Save, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { COUNTIES } from "@/lib/terminal-data";

export interface TerminalPreferences {
  timezone: string;
  hour12: boolean;
  density: string;
  showAudit: boolean;
  county: string;
  allCounties: boolean;
  paymentAlerts: boolean;
  kycAlerts: boolean;
  ticketAlerts: boolean;
  digest: string;
  requireDocuments: boolean;
  requireLocation: boolean;
  duplicateReview: boolean;
  minimumScore: number;
  commission: number;
  payoutReview: boolean;
  payoutMinimum: number;
  sessionTimeout: string;
  confirmSensitive: boolean;
}

export const DEFAULT_PREFERENCES: TerminalPreferences = {
  timezone: "Africa/Nairobi", hour12: false, density: "compact", showAudit: true,
  county: "Nairobi County", allCounties: true, paymentAlerts: true, kycAlerts: true,
  ticketAlerts: true, digest: "daily", requireDocuments: true, requireLocation: true,
  duplicateReview: true, minimumScore: 75, commission: 10, payoutReview: true,
  payoutMinimum: 100, sessionTimeout: "30", confirmSensitive: true,
};

export function LiveClock({ timezone, hour12, collapsed }: Pick<TerminalPreferences, "timezone" | "hour12"> & { collapsed: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  const time = now ? new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12 }).format(now) : "--:--:--";
  const date = now ? new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(now) : "—";
  return <div className="border-t border-border p-3" title={`${date} · ${time} · ${timezone}`}>
    {collapsed ? <Clock3 className="mx-auto h-4 w-4 text-primary" /> : <>
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{timezone === "Africa/Nairobi" ? "NAIROBI · EAT" : timezone === "UTC" ? "UTC" : "LONDON"}</span><span className="text-ok">LIVE</span></div>
      <time data-testid="live-clock" className="block h-7 font-mono text-xl font-bold tabular-nums text-primary">{time}</time>
      <div className="mt-1 font-mono text-[10px] text-muted-foreground">{date}</div>
    </>}
  </div>;
}

const CATEGORIES = [
  { key: "workspace", label: "Workspace", icon: Globe2 },
  { key: "display", label: "Display & clock", icon: Monitor },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "listings", label: "Listings & KYC", icon: Building2 },
  { key: "finance", label: "Payments & payouts", icon: Wallet },
  { key: "security", label: "Security & access", icon: ShieldCheck },
] as const;

export function TerminalSettings({ value, onApply }: { value: TerminalPreferences; onApply: (value: TerminalPreferences) => void }) {
  const [draft, setDraft] = useState(value);
  const [category, setCategory] = useState<string>("workspace");
  const [message, setMessage] = useState("");
  const change = <K extends keyof TerminalPreferences>(key: K, next: TerminalPreferences[K]) => {
    setDraft(previous => ({ ...previous, [key]: next }));
    setMessage("");
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const toggle = (key: keyof TerminalPreferences, title: string) => <div className="flex items-center justify-between gap-4 border-b border-border-subtle py-3"><label htmlFor={`setting-${key}`} className="text-xs">{title}</label><Switch id={`setting-${key}`} checked={Boolean(draft[key])} onCheckedChange={checked => change(key, checked)} /></div>;
  const select = (key: keyof TerminalPreferences, label: string, options: { value: string; label: string }[]) => <label className="grid gap-2 py-3 text-xs"><span>{label}</span><select aria-label={label} className="field w-full max-w-sm" value={String(draft[key])} onChange={event => change(key, event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  const number = (key: "minimumScore" | "commission" | "payoutMinimum", label: string, max: number) => <label className="grid gap-2 py-3 text-xs"><span>{label}</span><input aria-label={label} type="number" min={0} max={max} step={key === "commission" ? 0.5 : 1} required value={draft[key]} onChange={event => change(key, Number(event.target.value))} className="field w-36 font-mono" /></label>;
  const policy = category === "notifications" || category === "listings" || category === "finance" || category === "security";
  return <section className="flex h-full min-h-0 flex-col bg-card border border-border">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div><h1 className="text-base font-semibold">Settings</h1><p className="mt-1 text-[11px] text-muted-foreground">Session preferences · changes reset when this page reloads</p></div>
      <span className={`badge ${dirty ? "badge-warn" : "badge-ok"}`}>{dirty ? "UNSAVED CHANGES" : "UP TO DATE"}</span>
    </header>
    <div className="flex shrink-0 flex-wrap gap-1 border-b border-border bg-muted p-2" role="tablist" aria-label="Settings categories">{CATEGORIES.map(({key, label, icon: Icon}) => <Button key={key} variant="ghost" size="sm" role="tab" aria-selected={category === key} aria-controls="settings-content" id={`tab-${key}`} className={`h-8 shadow-none text-[11px] ${category === key ? "bg-active-soft text-primary border border-active" : "text-muted-foreground"}`} onClick={() => setCategory(key)}><Icon />{label}</Button>)}</div>
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={event => { event.preventDefault(); onApply(draft); setMessage("Session settings applied."); }}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" role="tabpanel" id="settings-content" aria-labelledby={`tab-${category}`}>
        {policy && <div className="mb-3 border-l-2 border-active bg-active-soft p-3 text-xs text-warn">Policy drafts only — live notifications, verification, payouts and security are not connected.</div>}
        <div className="max-w-2xl">
          {category === "workspace" && <>
            <h2 className="mb-2 font-semibold text-sm">Regional workspace</h2>
            <dl className="grid grid-cols-[100px_1fr] gap-y-2 border-b border-border pb-4 text-xs"><dt className="text-muted-foreground">Platform</dt><dd>NyumbaHub</dd><dt className="text-muted-foreground">Currency</dt><dd className="font-mono">KES · Kenyan shilling</dd><dt className="text-muted-foreground">Coverage</dt><dd>47 Kenyan counties</dd></dl>
            {select("county", "Default county", COUNTIES.map(county => ({ value: county, label: county })))}
            {toggle("allCounties", "Include all counties by default")}
            <h2 className="mt-5 mb-2 text-sm font-semibold">Service connections</h2>
            {["M-Pesa / Daraja", "Identity verification", "Email & SMS"].map(name => <div key={name} className="flex justify-between gap-3 border-b border-border-subtle py-3 text-xs"><span>{name}</span><span className="badge badge-warn">NOT CONNECTED</span></div>)}
          </>}
          {category === "display" && <>
            <h2 className="mb-2 text-sm font-semibold">Terminal appearance</h2>
            <div className="flex justify-between border-b border-border-subtle py-3 text-xs"><span>Theme</span><span className="text-primary">Green / <span className="text-warn-strong">Orange</span></span></div>
            {select("density", "Table density", [{ value: "compact", label: "Compact" }, { value: "comfortable", label: "Comfortable" }])}
            {toggle("showAudit", "Show operations audit log")}
            <h2 className="mt-5 mb-2 text-sm font-semibold">Live clock</h2>
            {select("timezone", "Clock timezone", [{ value: "Africa/Nairobi", label: "Nairobi — East Africa Time (UTC+3)" }, { value: "UTC", label: "Coordinated Universal Time (UTC)" }, { value: "Europe/London", label: "London — local time" }])}
            {toggle("hour12", "Use 12-hour clock")}
          </>}
          {category === "notifications" && <>
            <h2 className="mb-2 text-sm font-semibold">Operational alerts</h2>
            {toggle("paymentAlerts", "Failed payments & payout exceptions")}
            {toggle("kycAlerts", "Pending KYC & overdue reviews")}
            {toggle("ticketAlerts", "Priority support tickets")}
            {select("digest", "Summary frequency", [{value:"daily",label:"Daily"},{value:"weekly",label:"Weekly"},{value:"off",label:"Off"}])}
          </>}
          {category === "listings" && <>
            <h2 className="mb-2 text-sm font-semibold">Verification policy</h2>
            {toggle("requireDocuments", "Require owner identity documents")}
            {toggle("requireLocation", "Require verified property location")}
            {toggle("duplicateReview", "Send potential duplicates for manual review")}
            {number("minimumScore", "Minimum verification score (%)", 100)}
          </>}
          {category === "finance" && <>
            <h2 className="mb-2 text-sm font-semibold">Commission & disbursement policy</h2>
            {number("commission", "Default commission (%)", 25)}
            {number("payoutMinimum", "Minimum payout (KES)", 1000000)}
            {toggle("payoutReview", "Require manual review before host payouts")}
            <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">Existing booking commissions remain unchanged.</div>
          </>}
          {category === "security" && <>
            <h2 className="mb-2 text-sm font-semibold">Session policy draft</h2>
            {select("sessionTimeout", "Inactivity timeout", [{value:"15",label:"15 minutes"},{value:"30",label:"30 minutes"},{value:"60",label:"60 minutes"}])}
            {toggle("confirmSensitive", "Require confirmation for sensitive actions")}
            <h2 className="mt-5 mb-2 text-sm font-semibold">Access controls</h2>
            {["Administrator authentication", "Role & permission management", "Two-factor authentication"].map(name => <div key={name} className="flex items-center justify-between gap-3 border-b border-border-subtle py-3 text-xs"><span>{name}</span><span className="badge badge-warn">NOT CONNECTED</span></div>)}
          </>}
        </div>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-muted px-4 py-3">
        <span className="text-xs text-ok" role="status">{message || (dirty ? "Changes pending" : "No pending changes")}</span>
        <div className="flex gap-2"><Button type="button" variant="outline" size="sm" className="shadow-none" disabled={!dirty} onClick={() => {setDraft(value);setMessage("");}}><RotateCcw />Discard</Button><Button type="submit" size="sm" className="shadow-none" disabled={!dirty}><Save />Apply to session</Button></div>
      </footer>
    </form>
  </section>;
}