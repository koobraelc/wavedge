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
  router.get("/", (req, res) => {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 200);
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const source = (req.query.source as string) || undefined;
    const token = (req.query.token as string) || undefined;

    const articles = newsRepo.getArticles({ source, tokenTag: token, limit, offset });
    res.json({ data: articles, count: articles.length, limit, offset });
  });

  /** GET /api/news/sources — list available news sources */
  router.get("/sources", (_req, res) => {
    const sources = newsRepo.getSources();
    res.json({ data: sources });
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
