import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { api, can, clearToken, getToken, type User } from "./lib/api";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/students/Students";
import StudentForm from "./pages/students/StudentForm";
import StudentDetail from "./pages/students/StudentDetail";
import Import from "./pages/students/Import";
import FeeMapping from "./pages/setup/FeeMapping";
import Collect from "./pages/collect/Collect";
import Receipt from "./pages/collect/Receipt";
import Collections from "./pages/collect/Collections";
import SetupHome from "./pages/setup/SetupHome";
import Organisation from "./pages/setup/Organisation";
import FeeStructures from "./pages/setup/FeeStructures";
import { AcademicYears, BankAccounts, Classes, Concessions, FeeHeads, FeeTypes, LateFines, Sections, Staff } from "./pages/setup/Masters";

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
  if (!user) return <Login onSignedIn={setUser} />;
  const Guard = ({ perm }: { perm: string }) => (can(user, perm) ? <Outlet context={{ user }} /> : <Navigate to="/" replace />);
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<LayoutWithCtx user={user} onSignOut={signOut} />}>
          <Route index element={<Dashboard />} />
          <Route element={<Guard perm="collect" />}>
            <Route path="collect" element={<Collect />} />
            <Route path="collections" element={<Collections />} />
            <Route path="receipts/:id" element={<Receipt />} />
          </Route>
          <Route element={<Guard perm="students.read" />}>
            <Route path="students" element={<Students />} />
            <Route path="students/:id" element={<StudentDetail />} />
          </Route>
          <Route element={<Guard perm="students.write" />}>
            <Route path="students/new" element={<StudentForm />} />
            <Route path="students/import" element={<Import />} />
            <Route path="students/:id/edit" element={<StudentForm />} />
          </Route>
          <Route path="setup" element={<Guard perm="setup.read" />}>
            <Route index element={<SetupHome />} />
            <Route path="organisation" element={<Organisation />} />
            <Route path="academic-years" element={<AcademicYears />} />
            <Route path="classes" element={<Classes />} />
            <Route path="sections" element={<Sections />} />
            <Route path="fee-types" element={<FeeTypes />} />
            <Route path="fee-heads" element={<FeeHeads />} />
            <Route path="fee-structures" element={<FeeStructures />} />
            <Route path="fee-mapping" element={<FeeMapping />} />
            <Route path="concessions" element={<Concessions />} />
            <Route path="late-fines" element={<LateFines />} />
            <Route path="bank-accounts" element={<BankAccounts />} />
          </Route>
          <Route element={<Guard perm="staff.manage" />}><Route path="staff" element={<Staff />} /></Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function LayoutWithCtx({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return <Layout user={user} onSignOut={onSignOut} />;
}
