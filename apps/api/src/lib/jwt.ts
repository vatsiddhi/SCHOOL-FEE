import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-only-secret-change-me";

export type TokenPayload = { sub: string; institutionId: string; role: string };

export const signToken = (p: TokenPayload) => jwt.sign(p, SECRET, { expiresIn: "12h" });
export const verifyToken = (t: string) => jwt.verify(t, SECRET) as TokenPayload;
