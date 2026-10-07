export const COUNTIES = [
  "Mombasa","Kwale","Kilifi","Tana River","Lamu","Taita-Taveta","Garissa","Wajir","Mandera","Marsabit",
  "Isiolo","Meru","Tharaka-Nithi","Embu","Kitui","Machakos","Makueni","Nyandarua","Nyeri","Kirinyaga",
  "Murang'a","Kiambu","Turkana","West Pokot","Samburu","Trans Nzoia","Uasin Gishu","Elgeyo-Marakwet","Nandi","Baringo",
  "Laikipia","Nakuru","Narok","Kajiado","Kericho","Bomet","Kakamega","Vihiga","Bungoma","Busia",
  "Siaya","Kisumu","Homa Bay","Migori","Kisii","Nyamira","Nairobi",
].map((c) => `${c} County`);

const NAMES = ["Otieno Ochieng","Kamau Njoroge","Wanjiku Mwangi","Amina Hassan","Kipchumba Bett","Achieng Odhiambo","Mutua Musyoka","Njeri Kariuki","Fatuma Abdi","Cheruiyot Langat","Wafula Barasa","Nyambura Gitau","Omondi Owino","Halima Said","Kiprono Rotich","Moraa Nyaboke"];
const LOCS: [string, string][] = [["Westlands","Nairobi"],["Kilimani","Nairobi"],["Kilifi North","Kilifi"],["Kitisuru","Kiambu"],["Nyali","Mombasa"],["Nakuru East","Nakuru"],["Ruiru","Kiambu"],["Diani","Kwale"],["Kisumu Central","Kisumu"],["Kileleshwa","Nairobi"],["Eldoret East","Uasin Gishu"],["Malindi","Kilifi"]];

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const AL = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DG = "0123456789";
const mpesa = () => {
  let s = pick(["Q", "R", "S"]);
  for (let i = 0; i < 9; i++) s += i < 2 || i === 6 ? pick(AL.split("")) : pick((AL + DG).split(""));
  return s;
};
const phone = () => `+254 7${Math.floor(rnd() * 99).toString().padStart(2, "0")} ${Math.floor(100 + rnd() * 899)} ${Math.floor(100 + rnd() * 899)}`;
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join("");
const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
const ts = (minsAgo: number) => {
  const d = new Date(Date.UTC(2026, 9, 7, 13, 0, 0) - minsAgo * 60000 + 3 * 3600000);
  return d.toISOString().replace("T", " ").slice(0, 19);
};

export const kes = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type Status = string;

export interface Payment { id: string; ts: string; receipt: string; phone: string; amount: number; type: string; status: Status; name: string; merchantId: string; checkoutId: string; county: string }
export interface Kyc { id: string; name: string; phone: string; doc: string; county: string; submitted: string; status: Status; idNumber: string; reason?: string }
export interface Property { id: string; title: string; owner: string; location: string; county: string; category: string; price: number; type: string; status: Status; score: { docs: number; photos: number; geo: number; owner: number } }
export interface Payout { id: string; host: string; phone: string; ref: string; gross: number; commission: number; status: Status; county: string }
export interface Ticket { id: string; subject: string; user: string; phone: string; priority: string; channel: string; opened: string; status: Status; body: string; county: string }

const countyOf = (c: string) => `${c} County`;

export const PAYMENTS: Payment[] = Array.from({ length: 60 }, (_, i) => {
  const type = pick(["Listing Fee", "Booking Deposit", "Rent"]);
  const amount = type === "Listing Fee" ? pick([500, 1000, 2500]) : type === "Rent" ? pick([15000, 25000, 45000, 85000, 150000]) : pick([4500, 7800, 12000, 18500]);
  return { id: uuid(), ts: ts(i * 3 + Math.floor(rnd() * 3)), receipt: mpesa(), phone: phone(), amount, type, status: rnd() > 0.85 ? "FAILED" : rnd() > 0.85 ? "PENDING" : "COMPLETED", name: pick(NAMES), merchantId: `${Math.floor(10000 + rnd() * 89999)}-${Math.floor(1e7 + rnd() * 8e7)}-1`, checkoutId: `ws_CO_07102026${Math.floor(1e9 + rnd() * 8e9)}`, county: countyOf(pick(LOCS)[1]) };
});

export const KYCS: Kyc[] = Array.from({ length: 42 }, (_, i) => ({
  id: uuid(), name: pick(NAMES), phone: phone(), doc: pick(["National ID", "Title Deed", "Utility Bill"]), county: countyOf(pick(LOCS)[1]), submitted: ts(i * 17 + 5), status: i < 30 ? "PENDING" : rnd() > 0.5 ? "APPROVED" : "REJECTED", idNumber: `${Math.floor(20000000 + rnd() * 19999999)}`,
}));

const TITLES: Record<string, string[]> = { Bedsitter: ["Modern Bedsitter near Stage", "Spacious Bedsitter, Gated"], Apartment: ["2BR Apartment with Lift", "3BR Executive Apartment", "1BR Garden Apartment"], Airbnb: ["Ocean-view Studio Airbnb", "Cozy Loft Airbnb", "Penthouse Short-Stay"], Commercial: ["Ground-floor Retail Shop", "Office Suite 120sqm", "Godown 400sqm"] };
export const PROPERTIES: Property[] = Array.from({ length: 48 }, () => {
  const category = pick(Object.keys(TITLES));
  const [sub, county] = pick(LOCS);
  const type = category === "Airbnb" ? "Short-stay" : rnd() > 0.75 ? "Sale" : "Rent";
  const price = type === "Sale" ? pick([4500000, 8750000, 12500000, 32000000]) : type === "Short-stay" ? pick([3500, 6500, 9800, 15000]) : category === "Bedsitter" ? pick([8000, 12000, 15000]) : pick([35000, 65000, 120000, 250000]);
  return { id: uuid(), title: `${pick(TITLES[category])} — ${sub}`, owner: pick(NAMES), location: `${sub}, ${county}`, county: countyOf(county), category, price, type, status: rnd() > 0.45 ? "PENDING_MODERATION" : rnd() > 0.3 ? "ACTIVE" : "REJECTED", score: { docs: Math.floor(50 + rnd() * 50), photos: Math.floor(40 + rnd() * 60), geo: Math.floor(60 + rnd() * 40), owner: Math.floor(50 + rnd() * 50) } };
});

export const PAYOUTS: Payout[] = Array.from({ length: 36 }, () => ({
  id: uuid(), host: pick(NAMES), phone: phone(), ref: uuid(), gross: pick([9800, 14500, 22000, 38500, 56000, 72400, 125000]), commission: pick([8, 10, 12]), status: rnd() > 0.4 ? "PENDING_DISBURSEMENT" : "COMPLETED", county: countyOf(pick(LOCS)[1]),
}));

const SUBJ = ["STK push not received", "Double charge on deposit", "Listing stuck in moderation", "Host payout delayed", "Cannot upload Title Deed", "Guest no-show dispute", "Account locked after OTP"];
export const TICKETS: Ticket[] = Array.from({ length: 30 }, (_, i) => ({
  id: `TKT-${(48210 + i).toString()}`, subject: pick(SUBJ), user: pick(NAMES), phone: phone(), priority: pick(["P1", "P2", "P3"]), channel: pick(["USSD", "WhatsApp", "Web", "Call Centre"]), opened: ts(i * 23 + 2), status: rnd() > 0.5 ? "OPEN" : rnd() > 0.5 ? "IN_REVIEW" : "RESOLVED", body: "Customer reports issue with transaction flow. Verified phone ownership via OTP. Awaiting ops action.", county: countyOf(pick(LOCS)[1]),
}));

export function statusTone(s: string): "ok" | "warn" | "bad" {
  if (["COMPLETED", "APPROVED", "ACTIVE", "RESOLVED"].includes(s)) return "ok";
  if (["FAILED", "REJECTED", "BANNED", "DUPLICATE", "ARCHIVED"].includes(s)) return "bad";
  return "warn";
}
