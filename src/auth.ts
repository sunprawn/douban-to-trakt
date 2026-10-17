import 'dotenv/config';
import { DatabaseService } from './services/DatabaseService';
import { TraktService } from './services/TraktService';

/**
 * One-off Trakt authorization via the device code flow. Needs only the
 * client id and no browser callback, so it runs anywhere the database
 * lives, including inside the container on the server.
 */
async function main(): Promise<void> {
  const db = DatabaseService.getInstance();
  const trakt = TraktService.getInstance();

  await db.connect();
  try {
    const device = await trakt.requestDeviceCode();
    console.log(`Open ${device.verification_url} and enter: ${device.user_code}`);
    console.log(
      `Waiting for approval, code expires in ${Math.round(device.expires_in / 60)} minutes...`
    );

    const tokens = await trakt.pollDeviceToken(device);
    console.log('Authorized. Verifying token refresh...');

    // Refreshing right away proves the stored configuration works before
    // the daemon has to rely on it a week from now.
    const refreshed = await trakt.refreshAccessToken(tokens.refreshToken);
    console.log(`Done. Access token valid until ${refreshed.expiresAt}.`);
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('Trakt authorization failed:', error);
  process.exitCode = 1;
});
