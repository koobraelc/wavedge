import { NextRequest, NextResponse } from "next/server";
import { WhalePipeline } from "@/lib/scrapers/whale-pipeline";
import { SchedulerRepository } from "@/lib/db/scheduler-repository";

const schedulerRepo = new SchedulerRepository();

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pipeline = new WhalePipeline();
    const result = await pipeline.ingest();
    return NextResponse.json({
      ok: true,
      task: "whales",
      transactionsIngested: result.transactionsIngested,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Whale cron failed:", err);
    await schedulerRepo.logError("whale", err);
    return NextResponse.json({ error: "Whale fetch failed" }, { status: 500 });
  }
}
