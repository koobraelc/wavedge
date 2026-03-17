import { NextRequest, NextResponse } from "next/server";
import { PricePipeline } from "@/lib/scrapers/price-pipeline";
import { SchedulerRepository } from "@/lib/db/scheduler-repository";

const schedulerRepo = new SchedulerRepository();

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pipeline = new PricePipeline();
    await pipeline.ingest();
    return NextResponse.json({ ok: true, task: "price", timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("Price cron failed:", err);
    await schedulerRepo.logError("price", err);
    return NextResponse.json({ error: "Price fetch failed" }, { status: 500 });
  }
}
