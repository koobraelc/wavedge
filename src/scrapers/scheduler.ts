import cron, { type ScheduledTask } from "node-cron";
import { PricePipeline } from "./price-pipeline.js";

let scheduledTask: ScheduledTask | null = null;

export function startPriceScheduler(intervalCron: string = "*/5 * * * *"): void {
  if (scheduledTask) {
    console.warn("Price scheduler already running");
    return;
  }

  const pipeline = new PricePipeline();

  console.log(`Starting price scheduler with cron: ${intervalCron}`);

  // Run immediately on start
  pipeline.ingest().catch((err) => console.error("Initial price fetch failed:", err));

  scheduledTask = cron.schedule(intervalCron, async () => {
    await pipeline.ingest();
  });
}

export function stopPriceScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log("Price scheduler stopped");
  }
}
