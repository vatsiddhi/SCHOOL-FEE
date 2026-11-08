import { Router, Request } from "express";
import { z } from "zod";
import { prisma } from "./prisma";
import { audit } from "./audit";
import { requirePerm } from "./rbac";

type Opts = {
  model: string;                     // prisma delegate name e.g. "unit"
  entity: string;                    // audit entity e.g. "Unit"
  schema: z.ZodObject<any>;          // create body
  orderBy?: any;
  include?: any;
  where?: (req: Request) => any;     // extra list filters from query
  readPerm?: string; writePerm?: string;
  beforeWrite?: (req: Request, data: any, id?: string) => Promise<any> | any;
  canDelete?: (id: string) => Promise<string | null>; // return message to block
};

/** Tenant-scoped CRUD. Every query is filtered by req.institutionId. */
export function crud(o: Opts) {
  const r = Router();
  const db = (prisma as any)[o.model];
  const read = requirePerm(o.readPerm || "setup.read");
  const write = requirePerm(o.writePerm || "setup.write");

  r.get("/", read, async (req, res) => {
    res.json(await db.findMany({ where: { institutionId: req.institutionId, ...(o.where?.(req) || {}) }, orderBy: o.orderBy, include: o.include }));
  });

  r.post("/", write, async (req, res) => {
    const p = o.schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    let data = p.data;
    if (o.beforeWrite) data = await o.beforeWrite(req, data);
    const row = await db.create({ data: { ...data, institutionId: req.institutionId } });
    await audit(req, "create", o.entity, row.id, undefined, row);
    res.status(201).json(row);
  });

  r.put("/:id", write, async (req, res) => {
    const id = String(req.params.id);
    const before = await db.findFirst({ where: { id, institutionId: req.institutionId } });
    if (!before) return res.status(404).json({ error: "Not found" });
    const p = o.schema.partial().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
    let data = p.data;
    if (o.beforeWrite) data = await o.beforeWrite(req, data, id);
    const row = await db.update({ where: { id }, data });
    await audit(req, "update", o.entity, id, before, row);
    res.json(row);
  });

  r.delete("/:id", write, async (req, res) => {
    const id = String(req.params.id);
    const before = await db.findFirst({ where: { id, institutionId: req.institutionId } });
    if (!before) return res.status(404).json({ error: "Not found" });
    const block = o.canDelete ? await o.canDelete(id) : null;
    // Records that are already in use are deactivated, never deleted
    if (block || "isActive" in before) {
      if (!("isActive" in before)) return res.status(409).json({ error: block });
      const row = await db.update({ where: { id }, data: { isActive: false } });
      await audit(req, "deactivate", o.entity, id, before, row);
      return res.json({ ...row, deactivated: true });
    }
    await db.delete({ where: { id } });
    await audit(req, "delete", o.entity, id, before);
    res.json({ deleted: true });
  });
  return r;
}

export const P = z.coerce.number().int().min(0); // paise / counts
export const optStr = z.string().trim().max(200).optional().nullable().transform(v => (v ? v : null));
