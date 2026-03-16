import "dotenv/config";
import fs from "fs";
import path from "path";
import { validateEnv } from "./config/env.js";
import { app } from "./app.js";
import { startPriceScheduler, startNewsScheduler, startAlertScheduler, startDigestScheduler, startSentimentScheduler, startWhaleScheduler, startImpactScheduler } from "./scrapers/scheduler.js";

// Validate all required env vars before anything else runs
validateEnv();

const port = parseInt(process.env.PORT ?? "3000", 10);

// Ensure data directory exists for SQLite
const dataDir = process.env.DATABASE_PATH
  ? path.dirname(process.env.DATABASE_PATH)
  : path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

app.listen(port, () => {
  console.log(`Wavedge running on http://localhost:${port}`);
  startPriceScheduler();
  startNewsScheduler();
  startAlertScheduler();
  startDigestScheduler();
  startSentimentScheduler();
  startWhaleScheduler();
  startImpactScheduler();
});
