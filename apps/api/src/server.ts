import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import { students, dues } from "./routes/students";
import { collect, receipts } from "./routes/collect";
import { auth } from "./routes/auth";
import { requireAuth } from "./middleware/auth";
import { setup } from "./routes/setup";
import { structures } from "./routes/structures";
import { staff } from "./routes/staff";
import { requirePerm } from "./lib/rbac";

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", auth);
app.use("/api/students", requireAuth, requirePerm("students.read"), students);
app.use("/api/dues", requireAuth, dues);
app.use("/api/collect", requireAuth, collect);
app.use("/api/receipts", requireAuth, receipts);
app.use("/api/setup/fee-structures", requireAuth, structures);
app.use("/api/setup", requireAuth, setup);
app.use("/api/staff", requireAuth, staff);
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// Errors thrown in handlers (Express 5 forwards async rejections)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err?.code === "P2002") return res.status(409).json({ error: "This already exists (duplicate name or code)" });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side" });
});

// Serve the built React app (single-service deploy)
const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api|health).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`FeeDesk API on http://localhost:${port}`));
