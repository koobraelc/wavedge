import { Router } from "express";
import { NewsRepository } from "../db/news-repository.js";
import { ImpactRepository } from "../db/impact-repository.js";
import { ImpactCalculator } from "../services/impact-calculator.js";
import { NewsClassifier } from "../services/news-classifier.js";

export function createNewsRouter(
  repo?: NewsRepository,
  impactRepo?: ImpactRepository,
  classifier?: NewsClassifier
): Router {
  const router = Router();
  const newsRepo = repo || new NewsRepository();
  const impactRepository = impactRepo || new ImpactRepository();
  const newsClassifier = classifier || new NewsClassifier();
  const calculator = new ImpactCalculator(
    impactRepository,
    newsRepo,
    newsClassifier
  );

  /** GET /api/news — aggregated news with pagination and filtering */
  router.get("/", async (req, res) => {
    try {
      const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 200);
      const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
      const source = (req.query.source as string) || undefined;
      const token = (req.query.token as string) || undefined;

      const articles = await newsRepo.getArticles({ source, tokenTag: token, limit, offset });
      res.json({ data: articles, count: articles.length, limit, offset });
    } catch (err) {
      console.error("[News] Error:", err);
      res.status(500).json({ error: "Failed to fetch news" });
    }
  });

  /** GET /api/news/sources — list available news sources */
  router.get("/sources", async (_req, res) => {
    try {
      const sources = await newsRepo.getSources();
      res.json({ data: sources });
    } catch (err) {
      console.error("[News] Sources error:", err);
      res.status(500).json({ error: "Failed to fetch sources" });
    }
  });

  /** POST /api/news/batch-impact — get impact scores for multiple articles at once */
  router.post("/batch-impact", async (req, res) => {
    const ids: number[] = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array of article IDs" });
      return;
    }

    // Cap at 50 to prevent abuse
    const capped = ids.slice(0, 50).filter((id) => typeof id === "number" && !isNaN(id));

    try {
      const impacts = await calculator.getArticleImpactBatch(capped);
      // Return as a map keyed by articleId for easy lookup
      const map: Record<number, any> = {};
      for (const impact of impacts) {
        map[impact.articleId] = impact;
      }
      res.json({ data: map });
    } catch (error) {
      console.error("Batch impact calculation error:", error);
      res.status(500).json({ error: "Failed to calculate batch impacts" });
    }
  });

  /** GET /api/news/:id/impact — get impact score for a specific article */
  router.get("/:id/impact", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid article ID" });
      return;
    }

    try {
      const impact = await calculator.getArticleImpact(id);
      if (!impact) {
        res.status(404).json({ error: "Article not found" });
        return;
      }

      res.json({ data: impact });
    } catch (error) {
      console.error("Impact calculation error:", error);
      res.status(500).json({ error: "Failed to calculate impact" });
    }
  });

  return router;
}
