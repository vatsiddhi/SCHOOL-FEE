export type User = { id: string; name: string; email: string | null; role: string; institution: { code: string; name: string } };

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
