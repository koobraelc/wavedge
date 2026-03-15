import cron, { type ScheduledTask } from "node-cron";
import { PricePipeline } from "./price-pipeline.js";
import { NewsPipeline } from "./news-pipeline.js";

let priceTask: ScheduledTask | null = null;
let newsTask: ScheduledTask | null = null;

export function startPriceScheduler(intervalCron: string = "*/5 * * * *"): void {
  if (priceTask) {
    console.warn("Price scheduler already running");
    return;
  }

  const pipeline = new PricePipeline();

  console.log(`Starting price scheduler with cron: ${intervalCron}`);

  // Run immediately on start
  pipeline.ingest().catch((err) => console.error("Initial price fetch failed:", err));

  priceTask = cron.schedule(intervalCron, async () => {
    await pipeline.ingest();
  });
}

export function startNewsScheduler(intervalCron: string = "*/15 * * * *"): void {
  if (newsTask) {
    console.warn("News scheduler already running");
    return;
  }

  const pipeline = new NewsPipeline();

  console.log(`Starting news scheduler with cron: ${intervalCron}`);

  // Run immediately on start
  pipeline.ingest().catch((err) => console.error("Initial news fetch failed:", err));

  newsTask = cron.schedule(intervalCron, async () => {
    await pipeline.ingest();
  });
}

export function stopPriceScheduler(): void {
  if (priceTask) {
    priceTask.stop();
    priceTask = null;
    console.log("Price scheduler stopped");
  }
}

export function stopNewsScheduler(): void {
  if (newsTask) {
    newsTask.stop();
    newsTask = null;
    console.log("News scheduler stopped");
  }
}
