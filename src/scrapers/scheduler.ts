import cron, { type ScheduledTask } from "node-cron";
import { PricePipeline } from "./price-pipeline.js";
import { NewsPipeline } from "./news-pipeline.js";
import { ImpactRepository } from "../db/impact-repository.js";
import { NewsRepository } from "../db/news-repository.js";
import { NewsClassifier } from "../services/news-classifier.js";
import { ImpactCalculator } from "../services/impact-calculator.js";

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
  const calculator = new ImpactCalculator(
    new ImpactRepository(),
    new NewsRepository(),
    new NewsClassifier()
  );

  const runPipeline = async () => {
    const result = await pipeline.ingest();
    // Classify any new unclassified articles after ingestion
    if (result.success && result.articlesIngested > 0) {
      try {
        await calculator.classifyNewArticles(result.articlesIngested + 10);
      } catch (err) {
        console.error("Post-ingestion classification failed:", err);
      }
    }
  };

  console.log(`Starting news scheduler with cron: ${intervalCron}`);

  // Run immediately on start
  runPipeline().catch((err) => console.error("Initial news fetch failed:", err));

  newsTask = cron.schedule(intervalCron, runPipeline);
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
