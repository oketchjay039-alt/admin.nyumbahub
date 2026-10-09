import { createFileRoute } from "@tanstack/react-router";
import { Terminal } from "@/components/Terminal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NyumbaHub — Enterprise Control Terminal" },
      { name: "description", content: "Admin terminal for NyumbaHub: KYC, property moderation, short-stay, M-Pesa operations and internal admin mail." },
      { property: "og:title", content: "NyumbaHub — Enterprise Control Terminal" },
      { property: "og:description", content: "KYC, listings, M-Pesa payouts and secure internal admin mail in one dense terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Terminal,
});
