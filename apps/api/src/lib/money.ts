// All money is integer paise. Helpers for Indian formatting.
export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const formatINR = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

/** Indian financial year for a date: Apr–Mar, e.g. 2026-11-08 -> "2026-27" */
export const financialYear = (d: Date = new Date()) => {
  const ist = new Date(d.getTime() + 5.5 * 3600000); // FY boundary is midnight IST
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};

/** Start and end (UTC instants) of an IST calendar day "YYYY-MM-DD" */
export const istDayRange = (day: string) => {
  const start = new Date(`${day}T00:00:00+05:30`);
  return { start, end: new Date(start.getTime() + 86400000) };
};
export const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

/** Amount in words, Indian system: 123456.50 -> "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only" */
export function inWords(paise: number) {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number) => (n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : ""));
  const three = (n: number) => (n >= 100 ? a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + two(n % 100) : "") : two(n));
  const words = (n: number): string => {
    if (n === 0) return "Zero";
    const parts: string[] = [];
    const cr = Math.floor(n / 10000000); n %= 10000000;
    const lk = Math.floor(n / 100000); n %= 100000;
    const th = Math.floor(n / 1000); n %= 1000;
    if (cr) parts.push(words(cr) + " Crore");
    if (lk) parts.push(two(lk) + " Lakh");
    if (th) parts.push(two(th) + " Thousand");
    if (n) parts.push(three(n));
    return parts.join(" ");
  };
  const r = Math.floor(paise / 100), p = paise % 100;
  return `Rupees ${words(r)}${p ? ` and ${two(p)} Paise` : ""} Only`;
}
