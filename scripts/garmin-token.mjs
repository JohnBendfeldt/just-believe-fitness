#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Garmin, GarminClient } from 'garminconnect-js';

function createMemoryStore() {
  let saved = null;
  return {
    getCurrent: () => saved,
    store: {
      async load() {
        return saved;
      },
      async save(tokens) {
        saved = tokens;
      },
      async clear() {
        saved = null;
      },
    },
  };
}

async function main() {
  const rl = createInterface({ input, output });
  try {
    console.log('\n=== Just Believe Fitness · Garmin Session Token Helper ===');
    console.log('Signs into Garmin Connect from your residential IP so you can paste');
    console.log('the resulting OAuth token JSON into jbfit.studio.\n');

    const email = (await rl.question('Garmin Connect Email: ')).trim();
    const password = await rl.question('Garmin Connect Password: ');

    if (!email || !password) {
      console.error('\nError: Email and password are required.');
      process.exitCode = 1;
      return;
    }

    const { getCurrent, store } = createMemoryStore();
    const client = new GarminClient({ tokenStore: store });
    console.log('\nSigning in to Garmin SSO...');
    const result = await client.login(email, password);

    if (result && result.state === 'mfa_required') {
      const code = (
        await rl.question(
          `\nEnter the 6-digit Garmin verification code (${result.mfaState?.mfaMethod || 'email/SMS'}): `
        )
      ).trim();
      if (!code) {
        console.error('\nError: Verification code is required.');
        process.exitCode = 1;
        return;
      }
      await client.resumeLogin(result.mfaState, code);
    }

    const tokens = getCurrent() || client.getTokens();
    if (!tokens) {
      console.error('\nError: Garmin login completed without returning OAuth tokens.');
      process.exitCode = 1;
      return;
    }

    let athleteName = email;
    try {
      const full = await new Garmin(client).fullName();
      if (full) athleteName = full;
    } catch {
      // Optional name lookup
    }

    console.log(`\nSigned in as ${athleteName}!`);
    console.log('Copy the single-line JSON below and paste it into:');
    console.log('Rides & Sync -> Configure Garmin -> Paste Local Session Token\n');
    console.log('--- BEGIN GARMIN TOKEN JSON ---');
    console.log(JSON.stringify(tokens));
    console.log('--- END GARMIN TOKEN JSON ---\n');
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error('\nGarmin token generation failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
