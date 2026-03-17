import { NextResponse } from "next/server";
import { ImpactRepository } from "@/lib/db/impact-repository";
import { NewsRepository } from "@/lib/db/news-repository";
import { NewsClassifier } from "@/lib/services/news-classifier";
import { ImpactCalculator } from "@/lib/services/impact-calculator";

const calculator = new ImpactCalculator(
  new ImpactRepository(),
  new NewsRepository(),
  new NewsClassifier()
);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = parseInt(idStr);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid article ID" }, { status: 400 });
  }

  try {
    const impact = await calculator.getArticleImpact(id);
    if (!impact) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }
    return NextResponse.json({ data: impact });
  } catch (error) {
    console.error("Impact calculation error:", error);
    return NextResponse.json({ error: "Failed to calculate impact" }, { status: 500 });
  }
}
