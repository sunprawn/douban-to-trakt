import 'dotenv/config';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { Movie } from '../models/Movie';
import { Token } from '../models/Token';
import fs from 'fs';
import path from 'path';

export class DatabaseService {
  private static instance: DatabaseService;
  private db: Database | null = null;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async connect(): Promise<void> {
    const dbPath = path.resolve(
      process.cwd(),
      process.env.DB_NAME || 'movies.db'
    );

    // Ensure the directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    await this.db.run(`CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      rating INTEGER,
      imdb_id TEXT,
      rate_date TEXT,
      douban_link TEXT,
      synced_at TEXT
    )`);

    await this.db.run(`CREATE TABLE IF NOT EXISTS trakt_tokens (
        id INTEGER PRIMARY KEY,
        access_token TEXT,
        refresh_token TEXT,
        expires_at TEXT
      )`);
  }

  public async insertMovie(movie: Movie): Promise<void> {
    if (!this.db) throw new Error('Database not connected');
    await this.db.run(
      'INSERT INTO movies (title, rating, imdb_id, rate_date, douban_link) VALUES (?, ?, ?, ?, ?)',
      [
        movie.title,
        movie.rating,
        movie.imdbId,
        movie.rateDate,
        movie.doubanLink,
      ]
    );
  }

  public async movieExists(title: string): Promise<boolean> {
    if (!this.db) throw new Error('Database not connected');
    const result = await this.db.get('SELECT 1 FROM movies WHERE title = ?', [
      title,
    ]);
    return !!result;
  }

  public async close(): Promise<void> {
    if (this.db) await this.db.close();
  }

  public async updateTraktTokens(
    accessToken: string,
    refreshToken: string,
    expiresAt: Date
  ): Promise<void> {
    if (!this.db) throw new Error('Database not connected');
    await this.db.run(
      'INSERT OR REPLACE INTO trakt_tokens (id, access_token, refresh_token, expires_at) VALUES (1, ?, ?, ?)',
      [accessToken, refreshToken, expiresAt.toISOString()]
    );
  }

  public async getTraktTokens(): Promise<Token | null> {
    if (!this.db) throw new Error('Database not connected');
    const result = await this.db.get(
      'SELECT access_token, refresh_token, expires_at FROM trakt_tokens WHERE id = 1'
    );
    if (result) {
      return {
        accessToken: result.access_token,
        refreshToken: result.refresh_token,
        expiresAt: result.expires_at,
      };
    }
    return null;
  }

  public async updateMovieSyncStatus(movieId: number): Promise<void> {
    if (!this.db) throw new Error('Database not connected');
    await this.db.run('UPDATE movies SET synced_at = ? WHERE id = ?', [
      new Date().toISOString(),
      movieId,
    ]);
  }

  public async getUnsyncedMovies(): Promise<Movie[]> {
    if (!this.db) throw new Error('Database not connected');
    const rows = await this.db.all(
      'SELECT * FROM movies WHERE synced_at IS NULL and imdb_id IS NOT NULL'
    );

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      rating: row.rating,
      imdbId: row.imdb_id,
      rateDate: row.rate_date,
      doubanLink: row.douban_link,
      syncedAt: row.synced_at,
    }));
  }
}
