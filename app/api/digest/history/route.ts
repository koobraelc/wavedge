import { NextRequest, NextResponse } from "next/server";
import { DigestRepository } from "@/lib/db/digest-repository";

const repo = new DigestRepository();

export async function GET(request: NextRequest) {
  try {
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10");
    const digests = await repo.getRecentDigests(limit);
    return NextResponse.json({ data: digests });
  } catch (err) {
    console.error("[Digest] History error:", err);
    return NextResponse.json({ error: "Failed to fetch digest history" }, { status: 500 });
  }
}
