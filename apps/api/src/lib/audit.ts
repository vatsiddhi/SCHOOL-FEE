import { Request } from "express";
import { prisma } from "./prisma";

export async function audit(req: Request, action: string, entity: string, entityId: string, before?: unknown, after?: unknown) {
  await prisma.auditLog.create({
    data: {
      institutionId: req.institutionId!, actorType: "user", actorId: req.user?.sub, action, entity, entityId,
      beforeJson: before === undefined ? null : JSON.stringify(before),
      afterJson: after === undefined ? null : JSON.stringify(after), ip: req.ip,
    },
  }).catch(() => undefined);
}
