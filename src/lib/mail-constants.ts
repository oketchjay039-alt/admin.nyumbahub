export const DEPARTMENTS = ["Executive", "Finance", "KYC Operations", "Property Moderation", "Short-Stay", "Support", "Engineering", "Compliance", "Operations"] as const;
export type Department = (typeof DEPARTMENTS)[number];
export const LABELS = ["Action Required", "FYI", "Audit", "Incident", "Payouts", "Policy"] as const;
