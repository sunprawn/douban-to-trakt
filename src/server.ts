import 'dotenv/config';
import express, { Request, Response } from 'express';
import session from 'express-session';
import axios from 'axios';
import { DatabaseService } from './services/DatabaseService';

const app = express();
const port = 3000;

// Extend the session interface to include our custom properties
declare module 'express-session' {
  interface SessionData {
    // Add any session properties you might use
  }
}

app.use(
  session({
    secret: 'your_session_secret',
    resave: false,
    saveUninitialized: true,
  })
);

const dbService = DatabaseService.getInstance();

app.get('/', (req: Request, res: Response) => {
  res.send('<a href="/auth/trakt">Authenticate with Trakt</a>');
});

app.get('/auth/trakt', (req: Request, res: Response) => {
  const clientId = process.env.TRAKT_CLIENT_ID || '';
  const redirectUri = process.env.TRAKT_REDIRECT_URI;
  const traktAuthUrl = `https://trakt.tv/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`;
  res.redirect(traktAuthUrl);
});

app.get('/auth/trakt/callback', async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    return res.status(400).send('Authorization code is missing or invalid');
  }

  try {
    const response = await axios.post('https://api.trakt.tv/oauth/token', {
      code,
      client_id: process.env.TRAKT_CLIENT_ID,
      client_secret: process.env.TRAKT_CLIENT_SECRET,
      redirect_uri: process.env.TRAKT_REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    await dbService.connect();
    await dbService.updateTraktTokens(access_token, refresh_token, expiresAt);
    await dbService.close();

    res.send('Authentication successful! You can now close this window.');
  } catch (error) {
    console.error('Error during Trakt authentication:', error);
    res.status(500).send('An error occurred during authentication');
  }
});

async function startServer() {
  await dbService.connect();
  app.listen(port, () => {
    console.log(`OAuth server listening at http://localhost:${port}`);
  });
}

startServer().catch(console.error);
