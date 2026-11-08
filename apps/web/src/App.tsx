import { useCallback, useEffect, useState } from "react";
import { api, clearToken, getToken, type User } from "./lib/api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api<{ user: User }>("/api/auth/me").then(r => setUser(r.user)).catch(() => clearToken()).finally(() => setChecking(false));
  }, []);

  useEffect(() => { document.title = user ? `FeeDesk · ${user.institution.name}` : "FeeDesk · Sign in"; }, [user]);

  const signOut = useCallback(() => { clearToken(); setUser(null); }, []);

  if (checking) return <div className="boot"><span className="spinner dark" /></div>;
  return user ? <Dashboard user={user} onSignOut={signOut} /> : <Login onSignedIn={setUser} />;
}
