import "dotenv/config";
import { validateEnv } from "./config/env.js";
import { app } from "./app.js";
import { initializeSchema } from "./db/database.js";
import { startPriceScheduler, startNewsScheduler, startAlertScheduler, startDigestScheduler, startSentimentScheduler, startWhaleScheduler, startImpactScheduler } from "./scrapers/scheduler.js";

// Validate all required env vars before anything else runs
validateEnv();

const port = parseInt(process.env.PORT ?? "3000", 10);

async function main() {
  // Initialize PostgreSQL schema
  await initializeSchema();

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
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
