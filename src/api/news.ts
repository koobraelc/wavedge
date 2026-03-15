import { Router } from "express";
import { NewsRepository } from "../db/news-repository.js";

export function createNewsRouter(repo?: NewsRepository): Router {
  const router = Router();
  const newsRepo = repo || new NewsRepository();

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

  return router;
}
