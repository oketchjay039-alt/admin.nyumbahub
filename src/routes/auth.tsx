import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapSuperAdmin, getSetupState } from "@/lib/mail.functions";
import { DEPARTMENTS } from "@/lib/mail-constants";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — NyumbaHub Terminal" },
      { name: "description", content: "Restricted sign-in for NyumbaHub administrators. Accounts are issued by the super admin." },
      { property: "og:title", content: "Sign in — NyumbaHub Terminal" },
      { property: "og:description", content: "Restricted access for NyumbaHub administrators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const setupFn = useServerFn(getSetupState);
  const bootstrap = useServerFn(bootstrapSuperAdmin);
  const { data: setup } = useQuery({ queryKey: ["setup"], queryFn: () => setupFn() });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needsSetup = setup?.needsSetup;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (needsSetup) await bootstrap({ data: { full_name: name, email, password, department: "Executive", title: "Super Administrator" } });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/terminal" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form onSubmit={submit} className="w-full max-w-sm border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-topbar-border bg-topbar px-4 py-3 font-mono text-xs font-bold text-topbar-accent">
          <ShieldCheck className="h-4 w-4" /> NYUMBAHUB :: {needsSetup ? "FIRST-RUN SETUP" : "RESTRICTED ACCESS"}
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs text-muted-foreground">
            {needsSetup ? "No super admin exists yet. Create the super admin account — it will issue all other admin accounts." : "Accounts are issued by the super admin. There is no public sign-up."}
          </p>
          {needsSetup && <label className="block text-[10px] font-semibold uppercase text-muted-foreground">Full name<input required className="field mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} /></label>}
          <label className="block text-[10px] font-semibold uppercase text-muted-foreground">Work email<input required type="email" className="field mt-1 w-full font-mono" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="block text-[10px] font-semibold uppercase text-muted-foreground">Password<input required type="password" minLength={needsSetup ? 10 : 1} className="field mt-1 w-full font-mono" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {err && <div className="border border-border bg-muted p-2 text-xs text-destructive">{err}</div>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? "PLEASE WAIT…" : needsSetup ? "Create super admin & sign in" : "Sign in"}</button>
          <p className="font-mono text-[10px] text-muted-foreground">Departments: {DEPARTMENTS.length} · All sessions are audited.</p>
        </div>
      </form>
    </div>
  );
}
