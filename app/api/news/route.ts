import { NextRequest, NextResponse } from "next/server";
import { NewsRepository } from "@/lib/db/news-repository";

const newsRepo = new NewsRepository();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "50")), 200);
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0"));
    const source = searchParams.get("source") || undefined;
    const token = searchParams.get("token") || undefined;

    const articles = await newsRepo.getArticles({ source, tokenTag: token, limit, offset });
    return NextResponse.json({ data: articles, count: articles.length, limit, offset });
  } catch (err) {
    console.error("[News] Error:", err);
    return NextResponse.json({ error: "Failed to fetch news" }, { status: 500 });
  }
}
