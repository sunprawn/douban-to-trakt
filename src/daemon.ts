import 'dotenv/config';
import { runSync } from './sync';
import { DatabaseService } from './services/DatabaseService';
import { TraktService } from './services/TraktService';
import { delay } from './utils/helpers';

const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_JITTER_HOURS = 2;
const HOUR_MS = 60 * 60 * 1000;

// Trakt access tokens live 7 days. Check daily and refresh while at least
// two days remain, so the token never lapses between sync runs however
// long the sync interval is.
const TOKEN_CHECK_MS = 24 * HOUR_MS;
const TOKEN_MARGIN_MINUTES = 48 * 60;

function hoursFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** Interval plus a random 0..jitter extra, so runs never land on a fixed clock. */
function nextWaitMs(intervalHours: number, jitterHours: number): number {
  return (intervalHours + Math.random() * jitterHours) * HOUR_MS;
}

async function keepTokenFresh(): Promise<void> {
  const db = DatabaseService.getInstance();
  await db.connect();
  try {
    const token = await TraktService.getInstance().ensureFreshToken(
      TOKEN_MARGIN_MINUTES
    );
    console.log(`Trakt token valid until ${token.expiresAt}`);
  } finally {
    await db.close();
  }
}

/**
 * Long-running entry point for containers: sync, sleep, repeat. While
 * sleeping it wakes up daily to keep the Trakt token alive. A failed run
 * is logged and retried next time rather than taking the process down.
 */
async function main(): Promise<void> {
  const intervalHours = hoursFromEnv('SYNC_INTERVAL_HOURS', DEFAULT_INTERVAL_HOURS);
  const jitterHours = hoursFromEnv('SYNC_JITTER_HOURS', DEFAULT_JITTER_HOURS);
  console.log(
    `Sync daemon started, interval ${intervalHours}h + up to ${jitterHours}h jitter`
  );

  while (true) {
    console.log(`[${new Date().toISOString()}] Sync run started`);
    try {
      await runSync();
    } catch (error) {
      console.error('Sync run failed:', error);
    }

    const due = Date.now() + nextWaitMs(intervalHours, jitterHours);
    console.log(
      `[${new Date().toISOString()}] Next run at ${new Date(due).toISOString()}`
    );

    while (Date.now() < due) {
      await delay(Math.min(TOKEN_CHECK_MS, due - Date.now()));
      if (Date.now() >= due) break;
      try {
        await keepTokenFresh();
      } catch (error) {
        console.error('Trakt token check failed:', error);
      }
    }
  }
}

main().catch((error) => {
  console.error('Sync daemon crashed:', error);
  process.exit(1);
});
