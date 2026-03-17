import { NextRequest, NextResponse } from "next/server";
import { NewsPipeline } from "@/lib/scrapers/news-pipeline";
import { ImpactRepository } from "@/lib/db/impact-repository";
import { NewsRepository } from "@/lib/db/news-repository";
import { NewsClassifier } from "@/lib/services/news-classifier";
import { ImpactCalculator } from "@/lib/services/impact-calculator";
import { SchedulerRepository } from "@/lib/db/scheduler-repository";

const schedulerRepo = new SchedulerRepository();

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pipeline = new NewsPipeline();
    const result = await pipeline.ingest();

    // Classify new articles after ingestion
    if (result.success && result.articlesIngested > 0) {
      try {
        const calculator = new ImpactCalculator(
          new ImpactRepository(),
          new NewsRepository(),
          new NewsClassifier()
        );
        await calculator.classifyNewArticles(result.articlesIngested + 10);
      } catch (err) {
        console.error("Post-ingestion classification failed:", err);
        await schedulerRepo.logError("news_classification", err);
      }
    }

    return NextResponse.json({
      ok: true,
      task: "news",
      articlesIngested: result.articlesIngested,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("News cron failed:", err);
    await schedulerRepo.logError("news", err);
    return NextResponse.json({ error: "News fetch failed" }, { status: 500 });
  }
}
