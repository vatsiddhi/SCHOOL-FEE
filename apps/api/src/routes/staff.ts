import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requirePerm, ROLES } from "../lib/rbac";
import { audit } from "../lib/audit";

export const staff = Router();
staff.use(requirePerm("staff.manage"));

const pub = (u: any) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, isActive: u.isActive, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt });
const Body = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number").optional().nullable().or(z.literal("").transform(() => null)),
  role: z.enum(ROLES),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  isActive: z.boolean().optional(),
});

staff.get("/", async (req, res) => {
  res.json((await prisma.user.findMany({ where: { institutionId: req.institutionId }, orderBy: { name: "asc" } })).map(pub));
});

staff.post("/", async (req, res) => {
  const p = Body.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  if (!p.data.password) return res.status(400).json({ error: "Set a password (at least 8 characters)" });
  const { password, ...d } = p.data;
  try {
    const u = await prisma.user.create({ data: { ...d, institutionId: req.institutionId!, passwordHash: await bcrypt.hash(password, 10) } });
    await audit(req, "create", "User", u.id, undefined, pub(u));
    res.status(201).json(pub(u));
  } catch { res.status(409).json({ error: "A staff member with this email or mobile already exists" }); }
});

staff.put("/:id", async (req, res) => {
  const before = await prisma.user.findFirst({ where: { id: String(req.params.id), institutionId: req.institutionId } });
  if (!before) return res.status(404).json({ error: "Not found" });
  const p = Body.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const { password, ...d } = p.data;
  if (before.id === req.user!.sub && ((d.role && d.role !== "admin") || d.isActive === false)) return res.status(400).json({ error: "You can't remove your own admin access" });
  if (before.role === "admin" && ((d.role && d.role !== "admin") || d.isActive === false)) {
    const admins = await prisma.user.count({ where: { institutionId: req.institutionId, role: "admin", isActive: true } });
    if (admins <= 1) return res.status(400).json({ error: "At least one active admin is required" });
  }
  try {
    const u = await prisma.user.update({ where: { id: before.id }, data: { ...d, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) } });
    await audit(req, password ? "password_reset" : "update", "User", u.id, pub(before), pub(u));
    res.json(pub(u));
  } catch { res.status(409).json({ error: "A staff member with this email or mobile already exists" }); }
});

// Staff are never deleted (audit trail); "remove" disables sign-in
staff.delete("/:id", async (req, res) => {
  const u = await prisma.user.findFirst({ where: { id: String(req.params.id), institutionId: req.institutionId } });
  if (!u) return res.status(404).json({ error: "Not found" });
  if (u.id === req.user!.sub) return res.status(400).json({ error: "You can't disable your own account" });
  if (u.role === "admin" && (await prisma.user.count({ where: { institutionId: req.institutionId, role: "admin", isActive: true } })) <= 1) return res.status(400).json({ error: "At least one active admin is required" });
  const row = await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
  await audit(req, "deactivate", "User", u.id, pub(u), pub(row));
  res.json(pub(row));
});
