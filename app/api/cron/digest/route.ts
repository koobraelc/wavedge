import { NextRequest, NextResponse } from "next/server";
import { DigestGenerator } from "@/lib/services/digest-generator";
import { DigestDelivery } from "@/lib/services/digest-delivery";
import { DigestRepository } from "@/lib/db/digest-repository";
import { SchedulerRepository } from "@/lib/db/scheduler-repository";

const schedulerRepo = new SchedulerRepository();

export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const delivery = new DigestDelivery(new DigestGenerator(), new DigestRepository());
    const results = await delivery.runDaily();
    const totalEmails = results.reduce((sum, r) => sum + r.emailsSent, 0);
    const totalTelegrams = results.reduce((sum, r) => sum + r.telegramsSent, 0);

    return NextResponse.json({
      ok: true,
      task: "digest",
      emailsSent: totalEmails,
      telegramsSent: totalTelegrams,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Digest cron failed:", err);
    await schedulerRepo.logError("digest", err);
    return NextResponse.json({ error: "Digest send failed" }, { status: 500 });
  }
}
