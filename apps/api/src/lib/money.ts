// All money is integer paise. Helpers for Indian formatting.
export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const formatINR = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

/** Indian financial year for a date: Apr–Mar, e.g. 2026-11-08 -> "2026-27" */
export const financialYear = (d: Date = new Date()) => {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};
