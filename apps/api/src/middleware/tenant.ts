import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

declare global {
  namespace Express {
    interface Request { institutionId?: string }
  }
}

/** Resolves the institution from subdomain (dav-bbsr.app.in) or X-Institution-Code header (dev). */
export async function tenant(req: Request, res: Response, next: NextFunction) {
  const fromHeader = req.header("x-institution-code");
  const sub = req.hostname.split(".").length > 2 ? req.hostname.split(".")[0] : undefined;
  const code = fromHeader || sub;
  if (!code) return res.status(400).json({ error: "Institution not specified" });
  const inst = await prisma.institution.findUnique({ where: { code } });
  if (!inst || inst.status === "suspended") return res.status(404).json({ error: "Institution not found" });
  req.institutionId = inst.id;
  next();
}
