import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import { tenant } from "./middleware/tenant";
import { students } from "./routes/students";

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/students", tenant, students);

// Serve the built React app (single-service deploy)
const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api|health).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`FeeDesk API on http://localhost:${port}`));
