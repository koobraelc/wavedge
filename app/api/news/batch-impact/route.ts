import { NextRequest, NextResponse } from "next/server";
import { ImpactRepository } from "@/lib/db/impact-repository";
import { NewsRepository } from "@/lib/db/news-repository";
import { NewsClassifier } from "@/lib/services/news-classifier";
import { ImpactCalculator } from "@/lib/services/impact-calculator";

const calculator = new ImpactCalculator(
  new ImpactRepository(),
  new NewsRepository(),
  new NewsClassifier()
);

export async function POST(request: NextRequest) {
  const body = await request.json();
  const ids: number[] = body?.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: "ids must be a non-empty array of article IDs" },
      { status: 400 }
    );
  }

  const capped = ids.slice(0, 50).filter((id) => typeof id === "number" && !isNaN(id));

  try {
    const impacts = await calculator.getArticleImpactBatch(capped);
    const map: Record<number, unknown> = {};
    for (const impact of impacts) {
      map[impact.articleId] = impact;
    }
    return NextResponse.json({ data: map });
  } catch (error) {
    console.error("Batch impact calculation error:", error);
    return NextResponse.json({ error: "Failed to calculate batch impacts" }, { status: 500 });
  }
}
