import { Request, Response, NextFunction } from "express";
import { verifyToken, TokenPayload } from "../lib/jwt";

declare global {
  namespace Express {
    interface Request { user?: TokenPayload }
  }
}

/** Requires a valid Bearer token; the token's institution becomes the request tenant. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.header("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Not signed in" });
  try {
    req.user = verifyToken(token);
    req.institutionId = req.user.institutionId;
    next();
  } catch {
    res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}
