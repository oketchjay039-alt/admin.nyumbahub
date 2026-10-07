import { createFileRoute } from "@tanstack/react-router";
import { Terminal } from "@/components/Terminal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NyumbaHub — Enterprise Control Terminal" },
      { name: "description", content: "Admin terminal for NyumbaHub: KYC, property moderation, short-stay and M-Pesa operations across Kenya's 47 counties." },
      { property: "og:title", content: "NyumbaHub — Enterprise Control Terminal" },
      { property: "og:description", content: "KYC, listings, short-stay and M-Pesa payout operations in one dense admin terminal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Terminal,
});
