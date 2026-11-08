import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";
import { requireAuth } from "../middleware/auth";

export const auth = Router();

const LoginBody = z.object({
  institutionCode: z.string().trim().min(1, "Institution code is required").toLowerCase(),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const publicUser = (u: { id: string; name: string; email: string | null; role: string }, inst: { code: string; name: string }) => ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  institution: { code: inst.code, name: inst.name },
});

auth.post("/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { institutionCode, email, password } = parsed.data;

  const inst = await prisma.institution.findUnique({ where: { code: institutionCode } });
  const user = inst ? await prisma.user.findUnique({ where: { institutionId_email: { institutionId: inst.id, email } } }) : null;
  const ok = !!user && user.isActive && inst!.status !== "suspended" && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) return res.status(401).json({ error: "Incorrect institution code, email or password" });

  await prisma.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date() } });
  await prisma.auditLog.create({
    data: { institutionId: inst!.id, actorType: "user", actorId: user!.id, action: "login", entity: "User", entityId: user!.id, ip: req.ip },
  }).catch(() => undefined);

  res.json({ token: signToken({ sub: user!.id, institutionId: inst!.id, role: user!.role }), user: publicUser(user!, inst!) });
});

auth.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, include: { institution: true } });
  if (!user || !user.isActive) return res.status(401).json({ error: "Not signed in" });
  res.json({ user: publicUser(user, user.institution) });
});
