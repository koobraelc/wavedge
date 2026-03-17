import { NextRequest, NextResponse } from "next/server";
import { SocialPipeline } from "@/lib/scrapers/social-pipeline";
import { SchedulerRepository } from "@/lib/db/scheduler-repository";

const schedulerRepo = new SchedulerRepository();

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pipeline = new SocialPipeline();
    const result = await pipeline.ingest();
    return NextResponse.json({
      ok: true,
      task: "sentiment",
      tokensProcessed: result.tokensProcessed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Sentiment cron failed:", err);
    await schedulerRepo.logError("sentiment", err);
    return NextResponse.json({ error: "Sentiment fetch failed" }, { status: 500 });
  }
}
