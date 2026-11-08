import { type FormEvent, type ChangeEvent, useState } from "react";
import { api, setToken, type User } from "../lib/api";

const DEMO = { institutionCode: "demo-school", email: "accounts@demo.school", password: "demo123" };

export default function Login({ onSignedIn }: { onSignedIn: (u: User) => void }) {
  const [form, setForm] = useState({ institutionCode: "", email: "", password: "" });
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e?: FormEvent, values = form) {
    e?.preventDefault();
    setError(""); setBusy(true);
    try {
      const r = await api<{ token: string; user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify(values) });
      setToken(r.token, remember);
      onSignedIn(r.user);
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="logo"><span className="logo-mark">₹</span> FeeDesk</div>
        <div className="brand-copy">
          <h1>Fee collection that<br />balances itself.</h1>
          <p>Online payments, counter receipts and parent dues for schools, colleges and institutes across India.</p>
          <ul className="features">
            <li><span>✓</span> UPI, cards and net banking, settled to your own account</li>
            <li><span>✓</span> Counter collection with numbered FY receipts</li>
            <li><span>✓</span> Late fines, concessions and dues tracked to the paisa</li>
          </ul>
        </div>
        <p className="brand-foot">Secure sign-in · Data stored in India</p>
      </aside>

      <main className="auth-main">
        <form className="card" onSubmit={submit} noValidate>
          <div className="mobile-logo"><span className="logo-mark">₹</span> FeeDesk</div>
          <h2>Sign in</h2>
          <p className="muted">Staff login for your institution</p>

          {error && <div className="alert" role="alert">{error}</div>}

          <label className="field">
            <span>Institution code</span>
            <input value={form.institutionCode} onChange={set("institutionCode")} placeholder="e.g. dav-bbsr" autoComplete="organization" autoFocus required />
          </label>

          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={set("email")} placeholder="you@school.edu.in" autoComplete="username" required />
          </label>

          <label className="field">
            <span className="row-between">Password <a href="#" onClick={e => { e.preventDefault(); setError("To reset your password, contact your institution's FeeDesk admin."); }}>Forgot?</a></span>
            <div className="pw">
              <input type={showPw ? "text" : "password"} value={form.password} onChange={set("password")} placeholder="••••••••" autoComplete="current-password" required />
              <button type="button" className="ghost" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Hide password" : "Show password"}>{showPw ? "Hide" : "Show"}</button>
            </div>
          </label>

          <label className="check">
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Keep me signed in on this device
          </label>

          <button className="primary" disabled={busy}>{busy ? <span className="spinner" /> : "Sign in"}</button>

          <div className="demo">
            <div><strong>Trying FeeDesk?</strong> Use the demo school.</div>
            <button type="button" className="secondary" disabled={busy} onClick={() => { setForm(DEMO); submit(undefined, DEMO); }}>Use demo login</button>
          </div>

          <p className="muted small center">Parent? Use the parent portal link shared by your school.</p>
        </form>
      </main>
    </div>
  );
}
