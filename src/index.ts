import "dotenv/config";
import fs from "fs";
import path from "path";
import { app } from "./app.js";
import { startPriceScheduler } from "./scrapers/scheduler.js";

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
});
