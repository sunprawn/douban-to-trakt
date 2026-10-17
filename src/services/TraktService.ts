import 'dotenv/config';
import axios from 'axios';
import dayjs from 'dayjs';
import { DatabaseService } from './DatabaseService';
import { Movie } from '../models/Movie';
import { Token } from '../models/Token';
import { delay } from '../utils/helpers';

// Since Trakt's 2026-10 auth migration every OAuth call goes to a dedicated
// host; the data API stays on api.trakt.tv.
const AUTH_BASE_URL = 'https://auth.trakt.tv';
const API_BASE_URL = 'https://api.trakt.tv';

// The token endpoint requires redirect_uri even for device-flow apps that
// never redirect; the out-of-band URI is the conventional placeholder.
const DEFAULT_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

// Refresh a little early so a token never expires in the middle of a run.
const REFRESH_MARGIN_MINUTES = 60;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export class TraktService {
  private static instance: TraktService;
  private db: DatabaseService;

  private constructor() {
    this.db = DatabaseService.getInstance();
  }

  public static getInstance(): TraktService {
    if (!TraktService.instance) {
      TraktService.instance = new TraktService();
    }
    return TraktService.instance;
  }

  private clientId(): string {
    const clientId = process.env.TRAKT_CLIENT_ID;
    if (!clientId) {
      throw new Error('TRAKT_CLIENT_ID is not set.');
    }
    return clientId;
  }

  private async storeTokens(data: TokenResponse): Promise<Token> {
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await this.db.updateTraktTokens(
      data.access_token,
      data.refresh_token,
      expiresAt
    );
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Step 1 of the device code flow: get a code for the user to enter. */
  public async requestDeviceCode(): Promise<DeviceCode> {
    const response = await axios.post<DeviceCode>(
      `${AUTH_BASE_URL}/oauth/device/code`,
      { client_id: this.clientId() }
    );
    return response.data;
  }

  /**
   * Step 2 of the device code flow: poll until the user approves, denies,
   * or the code expires. Status codes follow the Trakt API reference.
   */
  public async pollDeviceToken(device: DeviceCode): Promise<Token> {
    const deadline = Date.now() + device.expires_in * 1000;
    let intervalSeconds = device.interval;

    while (Date.now() < deadline) {
      await delay(intervalSeconds * 1000);
      const response = await axios.post<TokenResponse>(
        `${AUTH_BASE_URL}/oauth/device/token`,
        { code: device.device_code, client_id: this.clientId() },
        { validateStatus: () => true }
      );

      switch (response.status) {
        case 200:
          return this.storeTokens(response.data);
        case 400:
          continue; // pending: user has not approved yet
        case 429:
          intervalSeconds += 1; // slow down
          continue;
        case 404:
          throw new Error('Invalid device code.');
        case 409:
          throw new Error('Device code was already used.');
        case 410:
          throw new Error('Device code expired, restart the process.');
        case 418:
          throw new Error('User denied the authorization.');
        default:
          throw new Error(
            `Unexpected status ${response.status} while polling for token: ` +
              JSON.stringify(response.data)
          );
      }
    }

    throw new Error('Device code expired before the user authorized the app.');
  }

  /**
   * Refresh tokens are single-use: the response carries a new refresh token
   * and the one just sent is invalidated, so the result is stored at once.
   */
  public async refreshAccessToken(refreshToken: string): Promise<Token> {
    const response = await axios.post<TokenResponse>(
      `${AUTH_BASE_URL}/oauth/token`,
      {
        refresh_token: refreshToken,
        client_id: this.clientId(),
        redirect_uri: process.env.TRAKT_REDIRECT_URI || DEFAULT_REDIRECT_URI,
        grant_type: 'refresh_token',
      },
      { validateStatus: () => true }
    );

    if (response.status !== 200) {
      throw new Error(
        `Trakt token refresh failed (${response.status}): ` +
          JSON.stringify(response.data)
      );
    }

    return this.storeTokens(response.data);
  }

  /**
   * Return a token that stays valid for at least marginMinutes, refreshing
   * if needed. Always reads from the database: the process may run for
   * months as a daemon, and the stored token is refreshed in place.
   */
  public async ensureFreshToken(
    marginMinutes = REFRESH_MARGIN_MINUTES
  ): Promise<Token> {
    const tokens = await this.db.getTraktTokens();

    if (!tokens) {
      throw new Error(
        'No Trakt tokens found in the database. Run the auth command first.'
      );
    }

    const refreshDue = dayjs(tokens.expiresAt).subtract(marginMinutes, 'minute');
    if (refreshDue.isBefore(dayjs())) {
      return this.refreshAccessToken(tokens.refreshToken);
    }

    return tokens;
  }

  public async getAccessToken(): Promise<string> {
    const tokens = await this.ensureFreshToken();
    return tokens.accessToken;
  }

  private async getHeaders() {
    const accessToken = await this.getAccessToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'trakt-api-version': '2',
      'trakt-api-key': this.clientId(),
    };
  }

  public async syncMovie(movie: Movie): Promise<void> {
    const headers = await this.getHeaders();

    try {
      const response = await axios.post(
        `${API_BASE_URL}/sync/history`,
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
        await axios.post(
          `${API_BASE_URL}/sync/ratings`,
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
