import cron, { type ScheduledTask } from "node-cron";
import { PricePipeline } from "./price-pipeline.js";
import { NewsPipeline } from "./news-pipeline.js";
import { ImpactRepository } from "../db/impact-repository.js";
import { NewsRepository } from "../db/news-repository.js";
import { NewsClassifier } from "../services/news-classifier.js";
import { ImpactCalculator } from "../services/impact-calculator.js";
import { AlertEngine } from "../services/alert-engine.js";
import { AlertRepository } from "../db/alert-repository.js";
import { PriceRepository } from "../db/price-repository.js";
import { DigestGenerator } from "../services/digest-generator.js";
import { DigestDelivery } from "../services/digest-delivery.js";
import { DigestRepository } from "../db/digest-repository.js";
import { SocialPipeline } from "./social-pipeline.js";
import { SchedulerRepository } from "../db/scheduler-repository.js";

let priceTask: ScheduledTask | null = null;
let newsTask: ScheduledTask | null = null;
let alertTask: ScheduledTask | null = null;
let digestTask: ScheduledTask | null = null;
let sentimentTask: ScheduledTask | null = null;

const schedulerRepo = new SchedulerRepository();

/** Last successful run timestamps for each scheduler */
export const schedulerStatus: Record<string, { lastRun: string | null; lastError: string | null }> = {
  price: { lastRun: null, lastError: null },
  news: { lastRun: null, lastError: null },
  alert: { lastRun: null, lastError: null },
  digest: { lastRun: null, lastError: null },
  sentiment: { lastRun: null, lastError: null },
};

export function startPriceScheduler(intervalCron: string = "*/5 * * * *"): void {
  if (priceTask) {
    console.warn("Price scheduler already running");
    return;
  }

  const pipeline = new PricePipeline();

  const run = async () => {
    try {
      await pipeline.ingest();
      schedulerStatus.price.lastRun = new Date().toISOString();
    } catch (err) {
      console.error("Price fetch failed:", err);
      schedulerStatus.price.lastError = new Date().toISOString();
      schedulerRepo.logError("price", err);
    }
  };

  console.log(`Starting price scheduler with cron: ${intervalCron}`);

  // Run immediately on start
  run();

  priceTask = cron.schedule(intervalCron, run);
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

  const run = async () => {
    try {
      const result = await pipeline.ingest();
      schedulerStatus.news.lastRun = new Date().toISOString();
      // Classify any new unclassified articles after ingestion
      if (result.success && result.articlesIngested > 0) {
        try {
          await calculator.classifyNewArticles(result.articlesIngested + 10);
        } catch (err) {
          console.error("Post-ingestion classification failed:", err);
          schedulerRepo.logError("news_classification", err);
        }
      }
    } catch (err) {
      console.error("News fetch failed:", err);
      schedulerStatus.news.lastError = new Date().toISOString();
      schedulerRepo.logError("news", err);
    }
  };

  console.log(`Starting news scheduler with cron: ${intervalCron}`);

  // Run immediately on start
  run();

  newsTask = cron.schedule(intervalCron, run);
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

export function startAlertScheduler(intervalCron: string = "*/2 * * * *"): void {
  if (alertTask) {
    console.warn("Alert scheduler already running");
    return;
  }

  const engine = new AlertEngine(new AlertRepository(), new PriceRepository());

  const runCycle = async () => {
    try {
      const result = await engine.runCycle();
      schedulerStatus.alert.lastRun = new Date().toISOString();
      if (result.alertsTriggered > 0) {
        console.log(`Alert cycle: ${result.alertsTriggered} alerts triggered`);
      }
      if (result.errors.length > 0) {
        console.error("Alert cycle errors:", result.errors);
        for (const e of result.errors) {
          schedulerRepo.logError("alert", e);
        }
      }
    } catch (err) {
      console.error("Alert cycle failed:", err);
      schedulerStatus.alert.lastError = new Date().toISOString();
      schedulerRepo.logError("alert", err);
    }
  };

  console.log(`Starting alert scheduler with cron: ${intervalCron}`);

  // Don't run immediately — wait for first price/news data
  alertTask = cron.schedule(intervalCron, runCycle);
}

export function stopAlertScheduler(): void {
  if (alertTask) {
    alertTask.stop();
    alertTask = null;
    console.log("Alert scheduler stopped");
  }
}

/** Daily digest scheduler — runs at 8:00 AM UTC by default */
export function startDigestScheduler(intervalCron: string = "0 8 * * *"): void {
  if (digestTask) {
    console.warn("Digest scheduler already running");
    return;
  }

  const delivery = new DigestDelivery(new DigestGenerator(), new DigestRepository());

  const runDigest = async () => {
    try {
      const results = await delivery.runDaily();
      schedulerStatus.digest.lastRun = new Date().toISOString();
      const totalEmails = results.reduce((sum, r) => sum + r.emailsSent, 0);
      const totalTelegrams = results.reduce((sum, r) => sum + r.telegramsSent, 0);
      console.log(`Digest sent: ${totalEmails} emails, ${totalTelegrams} telegrams`);
    } catch (err) {
      console.error("Digest pipeline failed:", err);
      schedulerStatus.digest.lastError = new Date().toISOString();
      schedulerRepo.logError("digest", err);
    }
  };

  console.log(`Starting digest scheduler with cron: ${intervalCron}`);

  digestTask = cron.schedule(intervalCron, runDigest);
}

export function stopDigestScheduler(): void {
  if (digestTask) {
    digestTask.stop();
    digestTask = null;
    console.log("Digest scheduler stopped");
  }
}

/** Social sentiment scheduler — runs every 30 minutes */
export function startSentimentScheduler(intervalCron: string = "*/30 * * * *"): void {
  if (sentimentTask) {
    console.warn("Sentiment scheduler already running");
    return;
  }

  const pipeline = new SocialPipeline();

  const run = async () => {
    try {
      const result = await pipeline.ingest();
      schedulerStatus.sentiment.lastRun = new Date().toISOString();
      console.log(`Sentiment pipeline: ${result.tokensProcessed} tokens (${result.source}) in ${result.durationMs}ms`);
    } catch (err) {
      console.error("Sentiment pipeline failed:", err);
      schedulerStatus.sentiment.lastError = new Date().toISOString();
      schedulerRepo.logError("sentiment", err);
    }
  };

  console.log(`Starting sentiment scheduler with cron: ${intervalCron}`);

  // Run immediately on start
  run();

  sentimentTask = cron.schedule(intervalCron, run);
}

export function stopSentimentScheduler(): void {
  if (sentimentTask) {
    sentimentTask.stop();
    sentimentTask = null;
    console.log("Sentiment scheduler stopped");
  }
}
