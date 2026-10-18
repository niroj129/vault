/** Payment app → CSS variable for its brand dot (see tw.css). */
const KEY: Record<string, string> = {
  ecashapp: "ecashapp", cashapp: "ecashapp", chime: "chime", venmo: "venmo", paypal: "paypal",
  applepay: "applepay", googlepay: "googlepay", zelle: "zelle",
};
export const payDot = (key: string) => `var(--pay-${KEY[key.toLowerCase().replace(/[^a-z]/g, "")] || "chime"}, var(--primary))`;

const LABEL: Record<string, string> = {
  cashapp: "Cash App", ecashapp: "Cash App", chime: "Chime", venmo: "Venmo", paypal: "PayPal", zelle: "Zelle",
  applepay: "Apple Pay", googlepay: "Google Pay", btc: "Bitcoin", bitcoin: "Bitcoin", card: "Card", ach: "Bank (ACH)",
};
export const payLabel = (m: string) => LABEL[m.toLowerCase().replace(/[^a-z]/g, "")] || m;

const HINT: Record<string, string> = { cashapp: "$cashtag", chime: "$ChimeSign or phone", venmo: "@username", paypal: "email or phone", zelle: "email or phone" };
export const payHandleHint = (m: string) => HINT[m.toLowerCase().replace(/[^a-z]/g, "")] || "$cashtag, phone or email";
