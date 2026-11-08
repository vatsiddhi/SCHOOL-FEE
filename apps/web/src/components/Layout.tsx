import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { can, type User } from "../lib/api";

type Item = { to: string; label: string; perm?: string };
const NAV: { title?: string; items: Item[] }[] = [
  { items: [{ to: "/", label: "Dashboard" }, { to: "/students", label: "Students", perm: "students.read" }] },
  { title: "Setup", items: [
    { to: "/setup", label: "Setup checklist", perm: "setup.read" },
    { to: "/setup/organisation", label: "Organisation", perm: "setup.read" },
    { to: "/setup/academic-years", label: "Academic years", perm: "setup.read" },
    { to: "/setup/classes", label: "Classes / courses", perm: "setup.read" },
    { to: "/setup/sections", label: "Sections", perm: "setup.read" },
    { to: "/setup/fee-types", label: "Fee types", perm: "setup.read" },
    { to: "/setup/fee-heads", label: "Fee heads", perm: "setup.read" },
    { to: "/setup/fee-structures", label: "Fee structures", perm: "setup.read" },
    { to: "/setup/concessions", label: "Concessions", perm: "setup.read" },
    { to: "/setup/late-fines", label: "Late fine rules", perm: "setup.read" },
    { to: "/setup/bank-accounts", label: "Bank accounts", perm: "setup.read" },
  ] },
  { title: "Administration", items: [{ to: "/staff", label: "Staff & roles", perm: "staff.manage" }] },
];

export default function Layout({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={"shell" + (open ? " nav-open" : "")}>
      <aside className="sidebar" onClick={() => setOpen(false)}>
        <div className="logo dark side-logo"><span className="logo-mark">₹</span> FeeDesk</div>
        {NAV.map((g, i) => {
          const items = g.items.filter(it => !it.perm || can(user, it.perm));
          if (!items.length) return null;
          return (
            <nav key={i}>
              {g.title && <div className="nav-title">{g.title}</div>}
              {items.map(it => <NavLink key={it.to} to={it.to} end className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>{it.label}</NavLink>)}
            </nav>
          );
        })}
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="secondary sm menu-btn" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
          <div className="inst">{user.institution.name}</div>
          <div className="me">
            <div className="avatar">{user.name.split(" ").map(w => w[0]).slice(0, 2).join("")}</div>
            <div className="me-text"><div>{user.name}</div><small className="role">{user.role}</small></div>
            <button className="secondary sm" onClick={onSignOut}>Sign out</button>
          </div>
        </header>
        <main className="content"><Outlet context={{ user }} /></main>
      </div>
    </div>
  );
}
