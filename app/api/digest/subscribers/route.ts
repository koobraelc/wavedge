import { NextResponse } from "next/server";
import { DigestRepository } from "@/lib/db/digest-repository";

const repo = new DigestRepository();

export async function GET() {
  try {
    const counts = await repo.getSubscriberCount();
    return NextResponse.json({ data: counts });
  } catch (err) {
    console.error("[Digest] Subscribers error:", err);
    return NextResponse.json({ error: "Failed to fetch subscriber count" }, { status: 500 });
  }
}
