import type { SavedRide, StravaConfig } from '../types/fitness';
import { buildRideTcxXml } from './tcxExporter';
import { loadStravaConfig, saveStravaConfig } from './storage';

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const NETLIFY_TOKEN_PROXY = '/api/strava-token';
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

async function postStravaTokenRequest(body: Record<string, string>): Promise<StravaTokenResponse> {
  // Prefer Netlify serverless function when deployed on Netlify (avoids CORS & supports Netlify env vars)
  try {
    const proxyResp = await fetch(NETLIFY_TOKEN_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const contentType = proxyResp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      if (!proxyResp.ok) {
        const errText = await proxyResp.text();
        throw new Error(`Strava token request failed (${proxyResp.status}): ${errText}`);
      }
      return (await proxyResp.json()) as StravaTokenResponse;
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Strava token request failed')) {
      throw err;
    }
    // Fall back to direct Strava endpoint when running locally without Netlify Functions
  }

  const directResp = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!directResp.ok) {
    const text = await directResp.text();
    throw new Error(`Strava token exchange failed (${directResp.status}): ${text}`);
  }

  return (await directResp.json()) as StravaTokenResponse;
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
  if (!config.clientId) {
    throw new Error('Enter your Strava Client ID before connecting.');
  }

  const data = await postStravaTokenRequest({
    client_id: config.clientId.trim(),
    client_secret: config.clientSecret.trim(),
    code,
    grant_type: 'authorization_code',
  });

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

  const refreshed = await postStravaTokenRequest({
    client_id: config.clientId.trim(),
    client_secret: config.clientSecret.trim(),
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
  });

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

export function buildRideSummaryDescription(ride: SavedRide): string {
  const bikeTag = ride.bikeLabel || 'Indoor Bike';
  const statsLine = [
    `Just Believe Fitness (JBF) · ${bikeTag}`,
    `Burn Points: ${ride.burnPoints} | Avg Power: ${ride.avgWatts}W (${ride.avgWkg.toFixed(2)} W/kg, NP ${ride.normalizedWatts}W)`,
    ride.avgHr > 0 ? `Avg HR: ${ride.avgHr} bpm (Max ${ride.maxHr} bpm)` : null,
    `Avg Cadence: ${ride.avgCadence} rpm | Calories: ${Math.round(ride.caloriesKcal)} kcal`,
  ]
    .filter(Boolean)
    .join(' • ');

  const trimmedNotes = ride.notes?.trim();
  return trimmedNotes ? `${trimmedNotes}\n\n${statsLine}` : statsLine;
}

export async function uploadRideToStrava(
  ride: SavedRide,
  onProgress?: (statusText: string) => void
): Promise<{ uploadId: number; activityId?: number }> {
  onProgress?.('Preparing TCX telemetry file...');
  const token = await getValidStravaAccessToken();
  const tcxXml = buildRideTcxXml(ride);
  const fileBlob = new Blob([tcxXml], { type: 'application/xml' });
  const description = buildRideSummaryDescription(ride);

  const form = new FormData();
  form.append('file', fileBlob, `${ride.id}.tcx`);
  form.append('data_type', 'tcx');
  form.append('activity_type', 'ride');
  form.append('SportType', 'VirtualRide');
  form.append('trainer', '1');
  form.append('name', ride.title);
  form.append('description', description);
  form.append('external_id', `jbf-${ride.id}.tcx`);

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

export async function updateStravaActivityDetails(ride: SavedRide): Promise<void> {
  if (!ride.stravaActivityId) {
    throw new Error('This workout has not been uploaded to Strava yet.');
  }
  const token = await getValidStravaAccessToken();
  const resp = await fetch(`https://www.strava.com/api/v3/activities/${ride.stravaActivityId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: ride.title,
      description: buildRideSummaryDescription(ride),
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Could not update Strava activity (${resp.status}): ${errText}`);
  }
}
