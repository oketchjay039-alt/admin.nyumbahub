import { describe, expect, it } from "vitest";
import { canApprovePayout, checkAmount, checkDailyPayout, nairobiDayStartIso, normalizeKenyanPhone } from "@/lib/mpesa-rules";

const limits = { perTxnMax: 150000, dailyPayoutMax: 1000000 };

describe("M-Pesa rules", () => {
  it("normalises Kenyan numbers", () => {
    expect(normalizeKenyanPhone("0712 345 678")).toBe("254712345678");
    expect(normalizeKenyanPhone("+254 110 123 456")).toBe("254110123456");
    expect(normalizeKenyanPhone("12345")).toBeNull();
  });
  it("blocks amounts above the per-transaction limit", () => {
    expect(checkAmount(150000, limits)).toBeNull();
    expect(checkAmount(150001, limits)).not.toBeNull();
    expect(checkAmount(0, limits)).not.toBeNull();
  });
  it("blocks payouts beyond the daily cap", () => {
    expect(checkDailyPayout(100000, 900000, limits)).toBeNull();
    expect(checkDailyPayout(100001, 900000, limits)).not.toBeNull();
  });
  it("requires a second admin to approve a payout", () => {
    expect(canApprovePayout("a", "a", "AWAITING_APPROVAL")).not.toBeNull();
    expect(canApprovePayout("a", "b", "AWAITING_APPROVAL")).toBeNull();
    expect(canApprovePayout("a", "b", "PENDING")).not.toBeNull();
  });
  it("uses Nairobi midnight as the daily boundary", () => {
    expect(nairobiDayStartIso(new Date("2026-10-19T22:30:00Z"))).toBe("2026-10-19T21:00:00.000Z");
  });
});
