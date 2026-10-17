import 'dotenv/config';
import { CrawlerService } from './services/CrawlerService';

async function main() {
  const userId = process.env.DOUBAN_USERNAME;
  const mode = process.argv[2] || 'incremental';

  if (!userId) {
    console.log('Please provide a Douban username.');
    process.exit(1);
  }

  const crawlerService = new CrawlerService();

  try {
    await crawlerService.init();
    // if mode is not 'initial', then it is incremental
    await crawlerService.crawlMovies(userId, mode !== 'initial');
  } catch (error) {
    console.error('An error occurred during the crawling process:', error);
    process.exitCode = 1;
  } finally {
    await crawlerService.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
