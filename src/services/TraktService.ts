// services/TraktService.ts
import 'dotenv/config';
import axios from 'axios';
import { DatabaseService } from './DatabaseService';
import { Movie } from '../models/Movie';
import { Token } from '../models/Token';
import dayjs from 'dayjs';
import { delay } from '../utils/helpers';

export class TraktService {
  private static instance: TraktService;
  private db: DatabaseService;
  private accessToken: string = '';

  private constructor() {
    this.db = DatabaseService.getInstance();
  }

  public static getInstance(): TraktService {
    if (!TraktService.instance) {
      TraktService.instance = new TraktService();
    }
    return TraktService.instance;
  }

  private async refreshAccessToken(refreshToken: string): Promise<Token> {
    try {
      const response = await axios.post('https://api.trakt.tv/oauth/token', {
        refresh_token: refreshToken,
        client_id: process.env.TRAKT_CLIENT_ID,
        client_secret: process.env.TRAKT_CLIENT_SECRET,
        redirect_uri:
          process.env.TRAKT_REDIRECT_URI ||
          'http://localhost:3000/auth/trakt/callback',
        grant_type: 'refresh_token',
      });

      const accessToken = response.data.access_token;
      const newRefreshToken = response.data.refresh_token;
      const expiresAt = new Date(Date.now() + response.data.expires_in * 1000);

      // Save new tokens to database
      await this.db.updateTraktTokens(accessToken, newRefreshToken, expiresAt);

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      console.error('Error refreshing Trakt access token:', error);
      throw error;
    }
  }

  private async getHeaders() {
    const accessToken = await this.getAccessToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'trakt-api-version': '2',
      'trakt-api-key': process.env.TRAKT_CLIENT_ID || '',
    };
  }

  public async getAccessToken(): Promise<string> {
    if (this.accessToken) {
      return this.accessToken;
    }

    const tokens = await this.db.getTraktTokens();

    if (!tokens) {
      throw new Error(
        'No Trakt tokens found in the database. Please authenticate first.'
      );
    }

    if (dayjs(tokens.expiresAt).isBefore()) {
      const newTokens = await this.refreshAccessToken(tokens.refreshToken);
      this.accessToken = newTokens.accessToken;
    } else {
      this.accessToken = tokens.accessToken;
    }

    return this.accessToken;
  }

  public async syncMovie(movie: Movie): Promise<void> {
    const headers = await this.getHeaders();

    try {
      const response = await axios.post(
        'https://api.trakt.tv/sync/history',
        {
          movies: [
            {
              ids: {
                imdb: movie.imdbId,
              },
              watched_at: movie.rateDate,
            },
          ],
        },
        { headers }
      );

      if (response.status !== 201) {
        throw new Error('Failed to sync movie to Trakt' + response.data);
      }

      if (movie.rating) {
        await delay(1000);
        const ratingResponse = await axios.post(
          'https://api.trakt.tv/sync/ratings',
          {
            movies: [
              {
                ids: {
                  imdb: movie.imdbId,
                },
                rating: movie.rating * 2,
                rated_at: movie.rateDate,
              },
            ],
          },
          { headers }
        );
      }

      // Update the sync status in the database
      await this.db.updateMovieSyncStatus(movie.id);
    } catch (error) {
      console.error('Error syncing movie to Trakt:', error);
      throw error;
    }
  }
}
