import { NextRequest, NextResponse } from "next/server";
import { AlertEngine } from "@/lib/services/alert-engine";
import { AlertRepository } from "@/lib/db/alert-repository";
import { PriceRepository } from "@/lib/db/price-repository";
import { SchedulerRepository } from "@/lib/db/scheduler-repository";

const schedulerRepo = new SchedulerRepository();

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const engine = new AlertEngine(new AlertRepository(), new PriceRepository());
    const result = await engine.runCycle();

    if (result.errors.length > 0) {
      for (const e of result.errors) {
        await schedulerRepo.logError("alert", e);
      }
    }

    return NextResponse.json({
      ok: true,
      task: "alerts",
      alertsTriggered: result.alertsTriggered,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Alert cron failed:", err);
    await schedulerRepo.logError("alert", err);
    return NextResponse.json({ error: "Alert check failed" }, { status: 500 });
  }
}
