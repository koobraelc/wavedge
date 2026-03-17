import { NextRequest, NextResponse } from "next/server";
import { ImpactCalculator } from "@/lib/services/impact-calculator";
import { ImpactRepository } from "@/lib/db/impact-repository";
import { NewsRepository } from "@/lib/db/news-repository";
import { NewsClassifier } from "@/lib/services/news-classifier";
import { PriceRepository } from "@/lib/db/price-repository";
import { SchedulerRepository } from "@/lib/db/scheduler-repository";

const schedulerRepo = new SchedulerRepository();

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const calculator = new ImpactCalculator(
      new ImpactRepository(),
      new NewsRepository(),
      new NewsClassifier(),
      new PriceRepository()
    );
    const count = await calculator.computeImpactEvents(200);

    return NextResponse.json({
      ok: true,
      task: "impact",
      eventsComputed: count,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Impact cron failed:", err);
    await schedulerRepo.logError("impact", err);
    return NextResponse.json({ error: "Impact computation failed" }, { status: 500 });
  }
}
