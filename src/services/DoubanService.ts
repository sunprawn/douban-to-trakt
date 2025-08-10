import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Movie } from '../models/Movie';

export class DoubanService {
  private static instance: DoubanService;

  private constructor() {}

  public static getInstance(): DoubanService {
    if (!DoubanService.instance) {
      DoubanService.instance = new DoubanService();
    }
    return DoubanService.instance;
  }

  private async fetchPage(url: string): Promise<cheerio.CheerioAPI> {
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          process.env.USER_AGENT ||
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.106 Safari/537.36',
      },
    });
    return cheerio.load(response.data);
  }

  private getRating(ratingClass: string): number {
    return parseInt(ratingClass[6]);
  }

  public async getImdbId(url: string): Promise<string | null> {
    try {
      const $ = await this.fetchPage(url);
      const infoArea = $('#info');

      if (infoArea.length) {
        const imdbText = infoArea
          .contents()
          .filter(function () {
            return $(this).text().trim().startsWith('tt');
          })
          .text()
          .trim();

        return imdbText;
      } else {
        console.log('Cannot access this movie page without logging in:', url);
      }
    } catch (error) {
      console.log('Unable to get IMDB ID for movie page:', url);
    }
    return null;
  }

  public async getMovieInfo(url: string): Promise<Movie[] | null> {
    const movies: Movie[] = [];
    try {
      const $ = await this.fetchPage(url);
      const movieItems = $('.item');

      if (movieItems.length > 0) {
        for (let i = 0; i < movieItems.length; i++) {
          const item = movieItems.eq(i);
          const doubanLink = item.find('a').attr('href') || '';
          const title = item.find('.title em').text();

          let rating: number | null = null;
          const ratingSpan = item.find('.date').prev('span');
          if (ratingSpan.length > 0) {
            rating = this.getRating(ratingSpan.attr('class') || '');
          }

          const commentDate = item.find('.date').text().trim();

          if (new Date(commentDate) <= new Date(process.env.START_DATE!)) {
            return movies;
          }

          movies.push({
            id: 0,
            title,
            rating,
            imdbId: null,
            rateDate: commentDate,
            doubanLink,
            syncedAt: null,
          });
        }
      } else {
        return null;
      }
    } catch (error) {
      console.error('Error fetching movie info:', error);
      return null;
    }

    return movies;
  }

  public async getMaxIndex(userId: string): Promise<number> {
    const url = `${process.env.DOUBAN_BASE_URL}/people/${userId}/collect`;
    try {
      const $ = await this.fetchPage(url);
      const paginator = $('.paginator');

      if (paginator.length) {
        const totalPages = paginator.find('span.thispage').data('total-page');
        if (totalPages) {
          const total = totalPages.toString();
          console.log(`Total pages: ${total}`);
          return parseInt(total);
        }
        return 1;
      } else {
        console.log('Total pages: 1');
        return 1;
      }
    } catch (error) {
      console.error('Error getting max index:', error);
      return 1;
    }
  }

  public async checkUserExist(userId: string): Promise<boolean> {
    try {
      const $ = await this.fetchPage(
        `${process.env.DOUBAN_BASE_URL}/people/${userId}/`
      );
      return !$('title').text().includes('页面不存在');
    } catch (error) {
      return false;
    }
  }

  public *urlGenerator(userId: string, totalPages: number): Generator<string> {
    for (let page = 0; page < totalPages; page++) {
      const start = page * 15;
      const base = process.env.DOUBAN_BASE_URL;
      yield `${base}/people/${userId}/collect?start=${start}&sort=time&rating=all&filter=all&mode=grid`;
    }
  }
}
