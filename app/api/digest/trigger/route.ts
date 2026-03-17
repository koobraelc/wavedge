import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/services/auth";
import { DigestGenerator } from "@/lib/services/digest-generator";
import { DigestDelivery } from "@/lib/services/digest-delivery";
import { DigestRepository } from "@/lib/db/digest-repository";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if (result instanceof NextResponse) return result;

  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(result.email.toLowerCase())) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const generator = new DigestGenerator();
    const repo = new DigestRepository();
    const delivery = new DigestDelivery(generator, repo);
    const results = await delivery.runDaily();
    return NextResponse.json({ data: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
