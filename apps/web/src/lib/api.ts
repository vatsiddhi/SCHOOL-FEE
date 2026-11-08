export type User = { id: string; name: string; email: string | null; role: string; perms: string[]; institution: { code: string; name: string } };
export const can = (u: User | null, perm: string) => !!u?.perms?.includes(perm);

const KEY = "feedesk.token";

export const getToken = () => localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
export const setToken = (t: string, remember: boolean) => {
  clearToken();
  (remember ? localStorage : sessionStorage).setItem(KEY, t);
};
export const clearToken = () => { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); };

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/auth/login") clearToken();
    throw Object.assign(new Error(body.error || "Something went wrong. Please try again."), { status: res.status });
  }
  return body as T;
}

export const inr = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);

export const http = {
  get: <T,>(p: string) => api<T>(p),
  post: <T,>(p: string, b: unknown) => api<T>(p, { method: "POST", body: JSON.stringify(b) }),
  put: <T,>(p: string, b: unknown) => api<T>(p, { method: "PUT", body: JSON.stringify(b) }),
  del: <T,>(p: string) => api<T>(p, { method: "DELETE" }),
};
export const inr2 = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100);
export const toPaise = (rupees: string | number) => Math.round(Number(rupees || 0) * 100);
export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "–";
export const isoDate = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
