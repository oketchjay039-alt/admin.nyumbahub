import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Paperclip, Star, Send, Reply, Volume2, VolumeX, LogOut, Lock, UserPlus, ShieldCheck, PenSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapSuperAdmin, createAdminAccount, getSetupState, sendMail, setAdminActive } from "@/lib/mail.functions";
import { DEPARTMENTS, LABELS, type Department } from "@/lib/mail-constants";
import type { InboxItem, MailMessage, MailState } from "./useMail";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const priTone = (p: string) => (p === "urgent" ? "badge-bad" : p === "high" ? "badge-warn" : "badge-ok");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function MailSignIn() {
  const setupFn = useServerFn(getSetupState);
  const bootstrap = useServerFn(bootstrapSuperAdmin);
  const { data: setup } = useQuery({ queryKey: ["mail-setup"], queryFn: () => setupFn() });
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needsSetup = setup?.needsSetup;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (needsSetup) await bootstrap({ data: { full_name: f.name, email: f.email, password: f.password, department: "Executive", title: "Super Administrator" } });
      const { error } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
      if (error) throw error;
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="flex h-full items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-sm border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-topbar-border bg-topbar px-4 py-3 font-mono text-xs font-bold text-topbar-accent">
          <Lock className="h-4 w-4" /> SECURE MAIL :: {needsSetup ? "FIRST-RUN SETUP" : "ADMIN SIGN-IN"}
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs text-muted-foreground">{needsSetup ? "Create the super admin mailbox. The super admin then issues mailboxes to every other admin." : "Sign in with the email and password your super admin issued to you."}</p>
          {needsSetup && <label className="block text-[10px] font-semibold uppercase text-muted-foreground">Full name<input required className="field mt-1 w-full" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>}
          <label className="block text-[10px] font-semibold uppercase text-muted-foreground">Work email<input required type="email" className="field mt-1 w-full font-mono" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="block text-[10px] font-semibold uppercase text-muted-foreground">Password<input required type="password" minLength={needsSetup ? 10 : 1} className="field mt-1 w-full font-mono" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
          {err && <div className="border border-border bg-muted p-2 text-xs text-destructive">{err}</div>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? "PLEASE WAIT…" : needsSetup ? "Create super admin & open mail" : "Open my mailbox"}</button>
        </div>
      </form>
    </div>
  );
}

function MessageView({ msg, onReply, mail }: { msg: MailMessage; onReply?: () => void; mail: MailState }) {
  const open = async (path: string) => {
    const { data } = await supabase.storage.from("mail-attachments").createSignedUrl(path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };
  void mail;
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1 border-b border-border p-3">
        <div className="flex flex-wrap items-center gap-1">
          <span className={`badge ${priTone(msg.priority)}`}>{msg.priority.toUpperCase()}</span>
          {msg.confidential && <span className="badge badge-bad">CONFIDENTIAL</span>}
          {msg.labels.map((l) => <span key={l} className="badge">{l}</span>)}
        </div>
        <h2 className="text-sm font-bold">{msg.subject}</h2>
        <div className="font-mono text-[11px] text-muted-foreground">FROM {msg.sender?.full_name} &lt;{msg.sender?.email}&gt; · {msg.sender?.department}</div>
        <div className="font-mono text-[11px] text-muted-foreground">TO {msg.to_label || "—"} · {fmt(msg.created_at)}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 text-xs leading-relaxed">{msg.body}</div>
      {msg.mail_attachments.length > 0 && <div className="flex flex-wrap gap-2 border-t border-border p-3">
        {msg.mail_attachments.map((a) => <button key={a.id} className="btn-secondary flex items-center gap-1" onClick={() => open(a.path)}><Paperclip className="h-3 w-3" />{a.name} <span className="font-mono text-[10px] text-muted-foreground">{Math.ceil(a.size / 1024)}KB</span></button>)}
      </div>}
      {onReply && <div className="border-t border-border p-3"><button className="btn-primary flex items-center gap-1" onClick={onReply}><Reply className="h-3 w-3" />Reply</button></div>}
    </div>
  );
}

interface Draft { to: string[]; departments: Department[]; subject: string; body: string; priority: "normal" | "high" | "urgent"; confidential: boolean; labels: string[]; threadId: string | null }
const emptyDraft: Draft = { to: [], departments: [], subject: "", body: "", priority: "normal", confidential: false, labels: [], threadId: null };

function Composer({ mail, initial, onDone }: { mail: MailState; initial: Draft; onDone: () => void }) {
  const send = useServerFn(sendMail);
  const [d, setD] = useState(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const others = mail.directory.filter((p) => p.id !== mail.me?.id && p.active);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const uid = mail.session!.user.id;
      const attachments = [];
      for (const f of files) {
        if (f.size > 20 * 1024 * 1024) throw new Error(`${f.name} is larger than 20MB`);
        const path = `${uid}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
        const { error } = await supabase.storage.from("mail-attachments").upload(path, f);
        if (error) throw error;
        attachments.push({ path, name: f.name, size: f.size, mime: f.type || null });
      }
      await send({ data: { ...d, attachments } });
      await mail.refresh();
      onDone();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-3 text-xs">
      <div className="font-mono text-[10px] font-bold uppercase text-muted-foreground">{d.threadId ? "Reply" : "New internal message"}</div>
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">To departments</div>
        <div className="flex flex-wrap gap-1">{DEPARTMENTS.map((x) => <button key={x} type="button" onClick={() => setD({ ...d, departments: toggle(d.departments, x) })} className={`border px-2 py-0.5 ${d.departments.includes(x) ? "border-active bg-active-soft font-semibold text-primary" : "border-border"}`}>#{x}</button>)}</div>
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">To people ({d.to.length})</div>
        <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">{others.length ? others.map((p) => <button key={p.id} type="button" onClick={() => setD({ ...d, to: toggle(d.to, p.id) })} className={`border px-2 py-0.5 ${d.to.includes(p.id) ? "border-active bg-active-soft font-semibold text-primary" : "border-border"}`}>{p.full_name} <span className="text-muted-foreground">· {p.department}</span></button>) : <span className="text-muted-foreground">No other admins yet — the super admin can add them under Accounts.</span>}</div>
      </div>
      <input className="field w-full" placeholder="Subject" value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} />
      <textarea className="field min-h-40 w-full flex-1 resize-none" placeholder="Write your message…" value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} />
      <div className="flex flex-wrap items-center gap-2">
        <select className="field" value={d.priority} onChange={(e) => setD({ ...d, priority: e.target.value as Draft["priority"] })}><option value="normal">Normal priority</option><option value="high">High priority</option><option value="urgent">Urgent</option></select>
        <label className="flex items-center gap-1"><input type="checkbox" checked={d.confidential} onChange={(e) => setD({ ...d, confidential: e.target.checked })} />Confidential</label>
        {LABELS.map((l) => <button key={l} type="button" onClick={() => setD({ ...d, labels: toggle(d.labels, l) })} className={`border px-2 py-0.5 ${d.labels.includes(l) ? "border-active bg-active-soft text-primary" : "border-border"}`}>{l}</button>)}
      </div>
      <label className="flex cursor-pointer items-center gap-1 text-muted-foreground"><Paperclip className="h-3 w-3" />Attach files (max 10, 20MB each)<input type="file" multiple className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10))} /></label>
      {files.length > 0 && <div className="flex flex-wrap gap-1">{files.map((f, i) => <span key={i} className="badge">{f.name} <button onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button></span>)}</div>}
      {err && <div className="border border-border bg-muted p-2 text-destructive">{err}</div>}
      <div className="flex gap-2">
        <button className="btn-primary flex items-center gap-1" disabled={busy || !d.subject.trim() || !d.body.trim() || (!d.to.length && !d.departments.length)} onClick={submit}><Send className="h-3 w-3" />{busy ? "SENDING…" : "Send"}</button>
        <button className="btn-secondary" onClick={onDone}>Discard</button>
      </div>
    </div>
  );
}

function Accounts({ mail }: { mail: MailState }) {
  const create = useServerFn(createAdminAccount);
  const toggle = useServerFn(setAdminActive);
  const [f, setF] = useState({ full_name: "", email: "", password: "", department: "Operations" as Department, title: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await create({ data: { ...f, title: f.title || undefined } }); setMsg(`Mailbox created for ${f.email}. Share the password with them securely.`); setF({ ...f, full_name: "", email: "", password: "", title: "" }); await mail.refresh(); }
    catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="grid h-full grid-cols-2 gap-3 overflow-auto p-3 text-xs">
      <form onSubmit={submit} className="space-y-2 border border-border p-3">
        <div className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase text-muted-foreground"><UserPlus className="h-3 w-3" />Issue admin mailbox</div>
        <input required className="field w-full" placeholder="Full name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        <input required type="email" className="field w-full font-mono" placeholder="work email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input required minLength={10} className="field w-full font-mono" placeholder="Temporary password (10+ chars)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <select className="field w-full" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value as Department })}>{DEPARTMENTS.map((x) => <option key={x}>{x}</option>)}</select>
        <input className="field w-full" placeholder="Job title (optional)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? "CREATING…" : "Create account"}</button>
        {msg && <div className="border border-border bg-muted p-2">{msg}</div>}
      </form>
      <div className="border border-border">
        <div className="border-b border-border p-2 font-mono text-[10px] font-bold uppercase text-muted-foreground">Admin directory ({mail.directory.length})</div>
        {mail.directory.map((p) => <div key={p.id} className="flex items-center justify-between gap-2 border-b border-border-subtle p-2">
          <div><div className="font-semibold">{p.full_name}</div><div className="font-mono text-[10px] text-muted-foreground">{p.email} · {p.department}</div></div>
          {p.id === mail.me?.id ? <span className="badge badge-ok">YOU</span> : <button className={p.active ? "btn-danger" : "btn-secondary"} onClick={async () => { try { await toggle({ data: { id: p.id, active: !p.active } }); await mail.refresh(); } catch (e) { alert(errMsg(e)); } }}>{p.active ? "Deactivate" : "Reactivate"}</button>}
        </div>)}
      </div>
    </div>
  );
}

export function MailCenter({ mail, folder }: { mail: MailState; folder: "inbox" | "outbox" }) {
  const [sel, setSel] = useState<string | null>(null);
  const [compose, setCompose] = useState<Draft | null>(null);
  const [tab, setTab] = useState<"mail" | "accounts">("mail");
  const [filter, setFilter] = useState<"all" | "unread" | "starred">("all");

  const inbox = useMemo(() => mail.inbox.filter((i) => (filter === "unread" ? !i.read_at : filter === "starred" ? i.starred : true)), [mail.inbox, filter]);
  if (!mail.ready) return <div className="p-6 font-mono text-xs text-muted-foreground">LOADING MAIL…</div>;
  if (!mail.session) return <MailSignIn />;

  const selInbox = folder === "inbox" ? mail.inbox.find((i) => i.id === sel) : undefined;
  const selOut = folder === "outbox" ? mail.outbox.find((m) => m.id === sel) : undefined;
  const openItem = (i: InboxItem) => { setSel(i.id); setCompose(null); mail.markRead(i); };
  const reply = (m: MailMessage) => setCompose({ ...emptyDraft, to: [m.sender_id], subject: m.subject.startsWith("RE:") ? m.subject : `RE: ${m.subject}`, body: `\n\n---- ${m.sender?.full_name} wrote (${fmt(m.created_at)}) ----\n${m.body}`, threadId: m.thread_id, priority: m.priority });

  return (
    <div className="flex h-full flex-col border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span className="font-bold">{mail.me?.full_name ?? mail.session.user.email}</span>
          <span className="text-muted-foreground">&lt;{mail.session.user.email}&gt; · {mail.me?.department}{mail.isSuperAdmin && " · SUPER ADMIN"}</span>
        </div>
        <div className="flex items-center gap-1">
          {mail.isSuperAdmin && <button className={tab === "accounts" ? "btn-primary" : "btn-secondary"} onClick={() => setTab(tab === "accounts" ? "mail" : "accounts")}>Accounts</button>}
          <button className="btn-primary flex items-center gap-1" onClick={() => { setTab("mail"); setCompose(emptyDraft); }}><PenSquare className="h-3 w-3" />Compose</button>
          <button className="btn-secondary" title={mail.sound ? "Mute new-mail sound" : "Unmute new-mail sound"} aria-label="Toggle mail sound" onClick={() => mail.setSound(!mail.sound)}>{mail.sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}</button>
          <button className="btn-secondary" title="Sign out of mail" aria-label="Sign out of mail" onClick={mail.signOut}><LogOut className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      {tab === "accounts" ? <Accounts mail={mail} /> : (
        <div className="flex min-h-0 flex-1">
          <div className="flex w-[38%] min-w-0 flex-col border-r border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5 font-mono text-[10px] uppercase text-muted-foreground">
              <span>{folder === "inbox" ? `Inbox · ${mail.unread} unread` : `Outbox · ${mail.outbox.length} sent`}</span>
              {folder === "inbox" && <select className="bg-transparent" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">All</option><option value="unread">Unread</option><option value="starred">Starred</option></select>}
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {folder === "inbox" ? (inbox.length ? inbox.map((i) => (
                <div key={i.id} role="button" tabIndex={0} onClick={() => openItem(i)} onKeyDown={(e) => e.key === "Enter" && openItem(i)} className={`cursor-pointer border-b border-border-subtle px-3 py-2 ${sel === i.id ? "bg-active-soft" : "hover:bg-muted"} ${!i.read_at ? "border-l-2 border-l-active" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-xs ${!i.read_at ? "font-bold" : ""}`}>{i.message.sender?.full_name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{fmt(i.message.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {i.message.priority !== "normal" && <span className={`badge ${priTone(i.message.priority)}`}>{i.message.priority.toUpperCase()}</span>}
                    {i.message.mail_attachments.length > 0 && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                    <span className={`truncate text-xs ${!i.read_at ? "font-semibold" : "text-muted-foreground"}`}>{i.message.subject}</span>
                    <button className="ml-auto" aria-label="Star" onClick={(e) => { e.stopPropagation(); mail.toggleStar(i); }}><Star className={`h-3 w-3 ${i.starred ? "fill-current text-active" : "text-muted-foreground"}`} /></button>
                  </div>
                </div>
              )) : <div className="p-6 text-center font-mono text-[11px] text-muted-foreground">NO MESSAGES</div>)
              : (mail.outbox.length ? mail.outbox.map((m) => (
                <div key={m.id} role="button" tabIndex={0} onClick={() => { setSel(m.id); setCompose(null); }} onKeyDown={(e) => e.key === "Enter" && setSel(m.id)} className={`cursor-pointer border-b border-border-subtle px-3 py-2 ${sel === m.id ? "bg-active-soft" : "hover:bg-muted"}`}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-xs">TO {m.to_label}</span><span className="shrink-0 font-mono text-[10px] text-muted-foreground">{fmt(m.created_at)}</span></div>
                  <div className="truncate text-xs text-muted-foreground">{m.subject}</div>
                </div>
              )) : <div className="p-6 text-center font-mono text-[11px] text-muted-foreground">NOTHING SENT YET</div>)}
            </div>
          </div>
          <div className="min-h-0 min-w-0 flex-1">
            {compose ? <Composer key={compose.threadId ?? "new"} mail={mail} initial={compose} onDone={() => setCompose(null)} />
              : selInbox ? <MessageView mail={mail} msg={selInbox.message} onReply={() => reply(selInbox.message)} />
              : selOut ? <MessageView mail={mail} msg={selOut} />
              : <div className="py-10 text-center font-mono text-[11px] text-muted-foreground">SELECT A MESSAGE OR COMPOSE</div>}
          </div>
        </div>
      )}
    </div>
  );
}
