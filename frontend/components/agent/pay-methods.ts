/** How an agent got paid (or paid out) — stored as a short label on the deposit. */
export const AGENT_METHODS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" }, { value: "cashapp", label: "Cash App" }, { value: "chime", label: "Chime" },
  { value: "venmo", label: "Venmo" }, { value: "paypal", label: "PayPal" }, { value: "zelle", label: "Zelle" }, { value: "other", label: "Other" },
];
export const QUICK_AMOUNTS = [10, 20, 25, 50, 100];
