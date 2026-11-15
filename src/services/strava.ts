import type { SavedRide, StravaConfig } from '../types/fitness';
import { buildRideTcxXml } from './tcxExporter';
import { loadStravaConfig, saveStravaConfig } from './storage';

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_UPLOADS_URL = 'https://www.strava.com/api/v3/uploads';

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: {
    id?: number;
    firstname?: string;
    lastname?: string;
    profile_medium?: string;
    ftp?: number | null;
    weight?: number | null;
  };
}

interface StravaUploadStatusResponse {
  id: number;
  status: string;
  error: string | null;
  activity_id: number | null;
}

export function buildStravaAuthorizeUrl(clientId: string): string {
  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams({
    client_id: clientId.trim(),
    response_type: 'code',
    redirect_uri: redirectUri,
    approval_prompt: 'auto',
    scope: 'read,profile:read_all,activity:write',
    state: 'jb_fitness_strava_oauth',
  });
  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

export async function exchangeStravaOAuthCode(
  code: string,
  config: StravaConfig
): Promise<{
  updatedConfig: StravaConfig;
  importedFtp?: number;
  importedWeightLbs?: number;
}> {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Enter your Strava Client ID and Client Secret before connecting.');
  }

  const resp = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId.trim(),
      client_secret: config.clientSecret.trim(),
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Strava token exchange failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as StravaTokenResponse;
  const fullName = [data.athlete?.firstname, data.athlete?.lastname].filter(Boolean).join(' ');

  const updatedConfig: StravaConfig = {
    ...config,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAtSec: data.expires_at,
    athleteName: fullName || config.athleteName || 'Connected Athlete',
    athleteAvatar: data.athlete?.profile_medium,
    athleteId: data.athlete?.id,
  };

  saveStravaConfig(updatedConfig);

  return {
    updatedConfig,
    importedFtp:
      typeof data.athlete?.ftp === 'number' && data.athlete.ftp > 50
        ? Math.round(data.athlete.ftp)
        : undefined,
    importedWeightLbs:
      typeof data.athlete?.weight === 'number' && data.athlete.weight > 25
        ? Math.round(data.athlete.weight * 2.20462262)
        : undefined,
  };
}

export async function getValidStravaAccessToken(): Promise<string> {
  const config = loadStravaConfig();
  if (!config.accessToken || !config.refreshToken) {
    throw new Error('Strava is not connected yet. Open Strava Settings to authorize.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (config.expiresAtSec && config.expiresAtSec - nowSec > 180) {
    return config.accessToken;
  }

  const resp = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId.trim(),
      client_secret: config.clientSecret.trim(),
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to refresh Strava access token (${resp.status}). Reconnect Strava.`);
  }

  const refreshed = (await resp.json()) as StravaTokenResponse;
  const nextConfig: StravaConfig = {
    ...config,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || config.refreshToken,
    expiresAtSec: refreshed.expires_at,
  };
  saveStravaConfig(nextConfig);
  return nextConfig.accessToken!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function uploadRideToStrava(
  ride: SavedRide,
  onProgress?: (statusText: string) => void
): Promise<{ uploadId: number; activityId?: number }> {
  onProgress?.('Preparing TCX telemetry file...');
  const token = await getValidStravaAccessToken();
  const tcxXml = buildRideTcxXml(ride);
  const fileBlob = new Blob([tcxXml], { type: 'application/xml' });

  const description = [
    `Just Believe Fitness · Echelon EX-3`,
    `Splat Points: ${ride.splatPoints} | Avg Power: ${ride.avgWatts}W (${ride.avgWkg.toFixed(2)} W/kg, NP ${ride.normalizedWatts}W)`,
    ride.avgHr > 0 ? `Avg HR: ${ride.avgHr} bpm (Max ${ride.maxHr} bpm)` : null,
    `Avg Cadence: ${ride.avgCadence} rpm | Calories: ${Math.round(ride.caloriesKcal)} kcal`,
  ]
    .filter(Boolean)
    .join(' • ');

  const form = new FormData();
  form.append('file', fileBlob, `${ride.id}.tcx`);
  form.append('data_type', 'tcx');
  form.append('activity_type', 'ride');
  form.append('SportType', 'VirtualRide');
  form.append('trainer', '1');
  form.append('name', ride.title);
  form.append('description', description);
  form.append('external_id', `jb-fitness-${ride.id}.tcx`);

  onProgress?.('Uploading workout to Strava...');
  const resp = await fetch(STRAVA_UPLOADS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Strava upload failed (${resp.status}): ${errText}`);
  }

  const created = (await resp.json()) as StravaUploadStatusResponse;
  if (created.error) {
    throw new Error(`Strava rejected file: ${created.error}`);
  }

  // Poll up to ~16 seconds for Strava to finish processing the TCX into an Activity ID
  for (let attempt = 0; attempt < 7; attempt++) {
    onProgress?.('Strava is processing your power & heart rate streams...');
    await sleep(2300);
    const pollResp = await fetch(`${STRAVA_UPLOADS_URL}/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!pollResp.ok) break;
    const pollData = (await pollResp.json()) as StravaUploadStatusResponse;
    if (pollData.error) {
      throw new Error(pollData.error);
    }
    if (pollData.activity_id) {
      return { uploadId: created.id, activityId: pollData.activity_id };
    }
  }

  return { uploadId: created.id };
}
