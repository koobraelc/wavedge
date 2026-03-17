import { NextRequest, NextResponse } from "next/server";
import { DigestRepository } from "@/lib/db/digest-repository";

const repo = new DigestRepository();

export async function GET(request: NextRequest) {
  try {
    const lang = request.nextUrl.searchParams.get("lang") === "zh" ? "zh" : "en";
    const digest = await repo.getLatestDigest(lang);
    if (!digest) {
      return NextResponse.json({ error: "No digest found" }, { status: 404 });
    }
    return NextResponse.json({ data: digest });
  } catch (err) {
    console.error("[Digest] Latest error:", err);
    return NextResponse.json({ error: "Failed to fetch latest digest" }, { status: 500 });
  }
}
