import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Terminal } from "@/components/Terminal";
import { getMe } from "@/lib/mail.functions";

export const Route = createFileRoute("/_authenticated/terminal")({
  head: () => ({
    meta: [
      { title: "NyumbaHub — Enterprise Control Terminal" },
      { name: "description", content: "Admin terminal for NyumbaHub: KYC, moderation, M-Pesa operations and internal admin mail." },
      { property: "og:title", content: "NyumbaHub — Enterprise Control Terminal" },
      { property: "og:description", content: "KYC, listings, M-Pesa operations and internal admin mail in one terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TerminalPage,
});

function TerminalPage() {
  const fetchMe = useServerFn(getMe);
  const { data, isLoading, error } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  if (isLoading) return <div className="flex h-screen items-center justify-center font-mono text-xs text-muted-foreground">AUTHENTICATING SESSION…</div>;
  if (error || !data?.profile) return <div className="flex h-screen items-center justify-center font-mono text-xs text-destructive">ACCOUNT PROFILE NOT FOUND — CONTACT YOUR SUPER ADMIN</div>;
  return <Terminal me={{ ...data.profile, isSuperAdmin: data.isSuperAdmin }} />;
}
