import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const triageTicketFn = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ message: z.string().trim().min(5).max(8000) }).parse(data))
  .handler(async ({ data }) => {
    const { triageTicket } = await import("./ticket-triage.server");
    return triageTicket(data.message);
  });
