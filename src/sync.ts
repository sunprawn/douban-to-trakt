import { CrawlerService } from './services/CrawlerService';
import 'dotenv/config';

async function main() {
  const crawlerService = new CrawlerService();
  const userId = process.env.DOUBAN_USERNAME;

  if (!userId) {
    console.log('Please provide a Douban username.');
    process.exit(1);
  }

  try {
    await crawlerService.init();

    // Crawl movies from Douban
    console.log('Starting to crawl movies from Douban...');
    await crawlerService.crawlMovies(userId, true);

    // Sync movies to Trakt
    console.log('Starting to sync movies to Trakt...');
    await crawlerService.syncMoviesToTrakt();

    console.log('Sync process completed successfully.');
  } catch (error) {
    console.error('An error occurred during the sync process:', error);
  } finally {
    await crawlerService.close();
  }
}

main().catch(console.error);
