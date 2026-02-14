import { DoubanService } from "./DoubanService";
import { DatabaseService } from "./DatabaseService";
import { TraktService } from "./TraktService";
import { Movie } from "../models/Movie";
import { delay } from "../utils/helpers";

export class CrawlerService {
  private doubanService: DoubanService;
  private dbService: DatabaseService;
  private traktService: TraktService;

  constructor() {
    this.doubanService = DoubanService.getInstance();
    this.dbService = DatabaseService.getInstance();
    this.traktService = TraktService.getInstance();
  }

  async init(): Promise<void> {
    await this.dbService.connect();
  }

  async close(): Promise<void> {
    await this.dbService.close();
  }

  async processMovie(movie: Movie, isIncremental: boolean): Promise<boolean> {
    const exists = await this.dbService.movieExists(movie.title);
    if (exists) {
      console.log(`Skipping "${movie.title}" - already in database`);
      return !isIncremental;
    }

    if (!movie.imdbId) {
      movie.imdbId = await this.doubanService.getImdbId(movie.doubanLink);
    }

    await this.dbService.insertMovie(movie);
    console.log(`Added "${movie.title}" to database`);
    return true;
  }

  async crawlMovies(userId: string, isIncremental: boolean): Promise<void> {
    const totalPages = await this.doubanService.getMaxIndex(userId);
    const urls = this.doubanService.urlGenerator(userId, totalPages);

    let pageNo = 1;
    let shouldContinue = true;
    let newMoviesCount = 0;

    for (const url of urls) {
      if (!shouldContinue) break;

      console.log(`Processing page ${pageNo}...`);
      const movies = await this.doubanService.getMovieInfo(url);
      if (movies) {
        for (const movie of movies) {
          await delay(20000);
          shouldContinue = await this.processMovie(movie, isIncremental);
          if (!shouldContinue) break;
          newMoviesCount++;
        }
      } else {
        break;
      }
      pageNo++;
      // Delay between pages
      await delay(1000);
    }

    console.log(`Processing complete. Total pages processed: ${pageNo - 1}`);
    console.log(`New movies added: ${newMoviesCount}`);
  }

  async syncMoviesToTrakt(): Promise<void> {
    const unsyncedMovies = await this.dbService.getUnsyncedMovies();
    for (const movie of unsyncedMovies) {
      await delay(1000);
      try {
        await this.traktService.syncMovie(movie);
        console.log(`Synced "${movie.title}" to Trakt`);
      } catch (error) {
        console.error(`Failed to sync "${movie.title}" to Trakt:`, error);
        throw error;
      }
    }
  }
}
