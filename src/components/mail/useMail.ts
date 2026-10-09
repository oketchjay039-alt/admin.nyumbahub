import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface MailProfile { id: string; full_name: string; email: string; department: string; title: string | null; active: boolean }
export interface MailAttachment { id: string; path: string; name: string; size: number; mime: string | null }
export interface MailMessage {
  id: string; thread_id: string; sender_id: string; subject: string; body: string; priority: "normal" | "high" | "urgent";
  confidential: boolean; labels: string[]; to_label: string; created_at: string;
  sender: { full_name: string; email: string; department: string } | null;
  mail_attachments: MailAttachment[];
}
export interface InboxItem { id: string; read_at: string | null; starred: boolean; archived: boolean; message: MailMessage }

const MSG_SELECT = "*, sender:profiles!mail_messages_sender_id_fkey(full_name,email,department), mail_attachments(*)";

/** Two-tone chime via Web Audio (no asset needed). */
export function playMailChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      const t = ctx.currentTime + i * 0.14;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.32);
    });
    setTimeout(() => ctx.close(), 800);
  } catch { /* audio unavailable */ }
}

export function useMail() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<MailProfile | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [outbox, setOutbox] = useState<MailMessage[]>([]);
  const [directory, setDirectory] = useState<MailProfile[]>([]);
  const [sound, setSound] = useState(true);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id ?? null;

  const refresh = useCallback(async () => {
    if (!uid) return;
    const [p, r, inb, out, dir] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("mail_recipients").select(`id, read_at, starred, archived, message:mail_messages(${MSG_SELECT})`).eq("user_id", uid).order("id"),
      supabase.from("mail_messages").select(MSG_SELECT).eq("sender_id", uid).order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").order("full_name"),
    ]);
    setMe((p.data as MailProfile) ?? null);
    setIsSuperAdmin((r.data ?? []).some((x) => x.role === "super_admin"));
    const items = ((inb.data ?? []) as unknown as InboxItem[]).filter((i) => i.message);
    items.sort((a, b) => b.message.created_at.localeCompare(a.message.created_at));
    setInbox(items);
    setOutbox((out.data ?? []) as unknown as MailMessage[]);
    setDirectory((dir.data ?? []) as MailProfile[]);
  }, [uid]);

  useEffect(() => {
    if (!uid) { setMe(null); setInbox([]); setOutbox([]); return; }
    refresh();
    const ch = supabase
      .channel(`mail-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mail_recipients", filter: `user_id=eq.${uid}` }, () => {
        if (soundRef.current) playMailChime();
        refresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, refresh]);

  const markRead = async (item: InboxItem) => {
    if (item.read_at) return;
    const now = new Date().toISOString();
    setInbox((xs) => xs.map((x) => (x.id === item.id ? { ...x, read_at: now } : x)));
    await supabase.from("mail_recipients").update({ read_at: now }).eq("id", item.id);
  };
  const toggleStar = async (item: InboxItem) => {
    setInbox((xs) => xs.map((x) => (x.id === item.id ? { ...x, starred: !x.starred } : x)));
    await supabase.from("mail_recipients").update({ starred: !item.starred }).eq("id", item.id);
  };

  const unread = inbox.filter((i) => !i.read_at && !i.archived).length;
  return { ready, session, me, isSuperAdmin, inbox, outbox, directory, unread, sound, setSound, refresh, markRead, toggleStar, signOut: () => supabase.auth.signOut() };
}
export type MailState = ReturnType<typeof useMail>;
