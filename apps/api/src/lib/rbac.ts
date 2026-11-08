import { Request, Response, NextFunction } from "express";

export const ROLES = ["admin", "accountant", "cashier"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Permission matrix. Keep in sync with apps/web/src/lib/perm.ts
 *  setup.read      – view masters (classes, heads, structures …)
 *  setup.write     – create/edit masters
 *  org.write       – edit organisation profile, bank accounts, gateway
 *  staff.manage    – manage staff users
 *  students.read / students.write
 *  collect         – take payments at counter
 *  approve         – concessions, waivers, cancellations, refunds
 *  reports         – view reports
 */
export const PERMS: Record<Role, string[]> = {
  admin: ["setup.read", "setup.write", "org.write", "staff.manage", "students.read", "students.write", "collect", "approve", "reports"],
  accountant: ["setup.read", "setup.write", "students.read", "students.write", "collect", "approve", "reports"],
  cashier: ["setup.read", "students.read", "collect"],
};

export const can = (role: string, perm: string) => (PERMS[role as Role] || []).includes(perm);

export const requirePerm = (perm: string) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !can(req.user.role, perm)) return res.status(403).json({ error: "You don't have permission to do this." });
  next();
};
