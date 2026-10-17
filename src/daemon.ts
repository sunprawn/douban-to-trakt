import 'dotenv/config';
import { runSync } from './sync';
import { delay } from './utils/helpers';

const DEFAULT_INTERVAL_HOURS = 24;

function intervalMs(): number {
  const hours = Number(process.env.SYNC_INTERVAL_HOURS);
  const effective = hours > 0 ? hours : DEFAULT_INTERVAL_HOURS;
  return effective * 60 * 60 * 1000;
}

/**
 * Long-running entry point for containers: run a sync, sleep, repeat.
 * A failed run is logged and retried at the next tick rather than
 * taking the process down, so a transient Douban/Trakt error is self-healing.
 */
async function main(): Promise<void> {
  const interval = intervalMs();
  console.log(`Sync daemon started, interval ${interval / 3600000}h`);

  while (true) {
    console.log(`[${new Date().toISOString()}] Sync run started`);
    try {
      await runSync();
    } catch (error) {
      console.error('Sync run failed:', error);
    }
    const next = new Date(Date.now() + interval).toISOString();
    console.log(`[${new Date().toISOString()}] Next run at ${next}`);
    await delay(interval);
  }
}

main().catch((error) => {
  console.error('Sync daemon crashed:', error);
  process.exit(1);
});
