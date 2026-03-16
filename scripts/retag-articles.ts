/**
 * Re-tag all existing articles with the improved token tagger.
 * Run: npx tsx scripts/retag-articles.ts
 */
import { NewsRepository } from "../src/db/news-repository.js";
import { extractTokenTags } from "../src/scrapers/news-pipeline.js";

const repo = new NewsRepository();
const result = repo.retagAllArticles(extractTokenTags);

console.log(`Re-tagged ${result.updated} of ${result.total} articles.`);
