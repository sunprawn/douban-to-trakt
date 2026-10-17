import 'dotenv/config';
import { CrawlerService } from './services/CrawlerService';

/**
 * One full pass: crawl new Douban entries, then push unsynced ones to Trakt.
 * Throws on failure so callers (CLI, daemon) decide how to react.
 */
export async function runSync(): Promise<void> {
  const userId = process.env.DOUBAN_USERNAME;
  if (!userId) {
    throw new Error('DOUBAN_USERNAME is not set.');
  }

  const crawlerService = new CrawlerService();
  try {
    await crawlerService.init();

    console.log('Starting to crawl movies from Douban...');
    await crawlerService.crawlMovies(userId, true);

    console.log('Starting to sync movies to Trakt...');
    await crawlerService.syncMoviesToTrakt();

    console.log('Sync process completed successfully.');
  } finally {
    await crawlerService.close();
  }
}

if (require.main === module) {
  runSync().catch((error) => {
    console.error('An error occurred during the sync process:', error);
    process.exitCode = 1;
  });
}
