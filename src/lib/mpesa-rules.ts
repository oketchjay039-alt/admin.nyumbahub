/** Pure M-Pesa business rules — shared by server functions and tests. */

/** Normalise Kenyan mobile numbers to Daraja's 2547XXXXXXXX / 2541XXXXXXXX format. Returns null when invalid. */
export function normalizeKenyanPhone(input: string): string | null {
  const d = input.replace(/[\s\-()]/g, "").replace(/^\+/, "");
  let n: string;
  if (/^0[17]\d{8}$/.test(d)) n = `254${d.slice(1)}`;
  else if (/^[17]\d{8}$/.test(d)) n = `254${d}`;
  else if (/^254[17]\d{8}$/.test(d)) n = d;
  else return null;
  return n;
}

export interface Limits { perTxnMax: number; dailyPayoutMax: number }

/** Returns an error message, or null when the amount is allowed. */
export function checkAmount(amount: number, limits: Limits): string | null {
  if (!Number.isInteger(amount) || amount < 1) return "Amount must be a whole number of at least KES 1.";
  if (amount > limits.perTxnMax) return `Amount exceeds the per-transaction limit of KES ${limits.perTxnMax.toLocaleString("en-KE")}.`;
  return null;
}

/** Daily cap counts every payout today that is not failed or rejected (including ones awaiting approval). */
export function checkDailyPayout(amount: number, usedToday: number, limits: Limits): string | null {
  if (usedToday + amount > limits.dailyPayoutMax) {
    const left = Math.max(0, limits.dailyPayoutMax - usedToday);
    return `Daily payout limit reached. KES ${left.toLocaleString("en-KE")} left today.`;
  }
  return null;
}

/** Four-eyes rule: the admin who requested a payout can never approve it. */
export function canApprovePayout(initiatedBy: string, approverId: string, status: string): string | null {
  if (status !== "AWAITING_APPROVAL") return "This payout is no longer waiting for approval.";
  if (initiatedBy === approverId) return "A second admin must approve this payout — you requested it.";
  return null;
}

/** Start of the current day in Nairobi (UTC+3), as an ISO string. */
export function nairobiDayStartIso(now = new Date()): string {
  const shifted = new Date(now.getTime() + 3 * 3600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 3 * 3600_000).toISOString();
}
