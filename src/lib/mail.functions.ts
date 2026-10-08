import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEPARTMENTS } from "@/lib/mail-constants";

const dept = z.enum(DEPARTMENTS);

/** Public: only tells whether first-run setup is still open. */
export const getSetupState = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
  return { needsSetup: (count ?? 0) === 0 };
});

const accountInput = z.object({
  full_name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(10).max(128),
  department: dept,
  title: z.string().trim().max(100).optional(),
});

async function createAccount(data: z.infer<typeof accountInput>, role: "super_admin" | "admin") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: data.email, password: data.password, email_confirm: true, user_metadata: { full_name: data.full_name },
  });
  if (error || !created.user) throw new Error(error?.message ?? "Could not create account");
  const id = created.user.id;
  const p = await supabaseAdmin.from("profiles").insert({ id, full_name: data.full_name, email: data.email, department: data.department, title: data.title ?? null });
  const r = await supabaseAdmin.from("user_roles").insert({ user_id: id, role });
  if (p.error || r.error) {
    await supabaseAdmin.auth.admin.deleteUser(id);
    throw new Error(p.error?.message ?? r.error?.message);
  }
  return { id };
}

/** Public, but only works while no super admin exists (first-run). */
export const bootstrapSuperAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => accountInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
    if ((count ?? 0) > 0) throw new Error("Setup already completed. Ask your super admin for an account.");
    return createAccount(data, "super_admin");
  });

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: profile }, { data: roles }] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    return { profile, isSuperAdmin: (roles ?? []).some((r) => r.role === "super_admin") };
  });

async function assertSuperAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  if (!data) throw new Error("Only the super admin can manage admin accounts.");
}

export const createAdminAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => accountInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    return createAccount(data, "admin");
  });

export const setAdminActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    if (data.id === context.userId) throw new Error("You cannot deactivate your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, { ban_duration: data.active ? "none" : "876000h" });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ active: data.active }).eq("id", data.id);
    return { ok: true };
  });

export const sendMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      to: z.array(z.string().uuid()).max(200),
      departments: z.array(dept).max(DEPARTMENTS.length),
      subject: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(20000),
      priority: z.enum(["normal", "high", "urgent"]),
      confidential: z.boolean(),
      labels: z.array(z.string().trim().min(1).max(30)).max(8),
      threadId: z.string().uuid().nullable(),
      attachments: z.array(z.object({ path: z.string().max(500), name: z.string().max(255), size: z.number().int().nonnegative(), mime: z.string().max(150).nullable() })).max(10),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = context.userId;
    if (data.attachments.some((a) => !a.path.startsWith(`${me}/`))) throw new Error("Invalid attachment.");
    if (data.threadId) {
      const { data: ok } = await context.supabase.rpc("can_read_message", { _message_id: data.threadId, _user: me });
      const { data: anyInThread } = await context.supabase.from("mail_messages").select("id").eq("thread_id", data.threadId).limit(1);
      if (!ok && !anyInThread?.length) throw new Error("Thread not found.");
    }
    const ids = new Set(data.to);
    if (data.departments.length) {
      const { data: members } = await supabaseAdmin.from("profiles").select("id").in("department", data.departments).eq("active", true);
      members?.forEach((m) => ids.add(m.id));
    }
    ids.delete(me);
    if (!ids.size) throw new Error("Add at least one recipient other than yourself.");
    const { data: valid } = await supabaseAdmin.from("profiles").select("id").in("id", [...ids]).eq("active", true);
    if (!valid?.length) throw new Error("No active recipients.");

    const toLabel = [...data.departments.map((d) => `#${d}`), ...(data.to.length ? [`${data.to.length} person(s)`] : [])].join(", ");
    const msgId = crypto.randomUUID();
    const { error } = await supabaseAdmin.from("mail_messages").insert({
      id: msgId, thread_id: data.threadId ?? msgId, sender_id: me, subject: data.subject, body: data.body,
      priority: data.priority, confidential: data.confidential, labels: data.labels, to_label: toLabel,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("mail_recipients").insert(valid.map((v) => ({ message_id: msgId, user_id: v.id })));
    if (data.attachments.length) await supabaseAdmin.from("mail_attachments").insert(data.attachments.map((a) => ({ ...a, message_id: msgId })));
    return { id: msgId, recipients: valid.length };
  });
