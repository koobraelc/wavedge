/**
 * Re-tag all existing articles with the improved token tagger.
 * Run: npx tsx scripts/retag-articles.ts
 */
import { NewsRepository } from "../src/db/news-repository.js";
import { extractTokenTags } from "../src/scrapers/news-pipeline.js";
import { resetTokenConfig } from "../src/scrapers/token-config.js";

// Force reload of token config from DB to pick up any new tokens
resetTokenConfig();

const repo = new NewsRepository();
const result = repo.retagAllArticles(extractTokenTags);

console.log(`Re-tagged ${result.updated} of ${result.total} articles.`);
