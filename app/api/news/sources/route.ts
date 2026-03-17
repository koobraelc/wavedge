import { NextResponse } from "next/server";
import { NewsRepository } from "@/lib/db/news-repository";

const newsRepo = new NewsRepository();

export async function GET() {
  try {
    const sources = await newsRepo.getSources();
    return NextResponse.json({ data: sources });
  } catch (err) {
    console.error("[News] Sources error:", err);
    return NextResponse.json({ error: "Failed to fetch sources" }, { status: 500 });
  }
}
