const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

const JSON_SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export async function handler(event) {
  if (event.httpMethod === 'GET') {
    const envClientId = process.env.STRAVA_CLIENT_ID || process.env.VITE_STRAVA_CLIENT_ID || '';
    const hasServerSecret = Boolean(process.env.STRAVA_CLIENT_SECRET);
    return {
      statusCode: 200,
      headers: JSON_SECURITY_HEADERS,
      body: JSON.stringify({ clientId: envClientId, hasServerSecret }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      body: 'Method Not Allowed',
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const clientId = (payload.client_id || process.env.STRAVA_CLIENT_ID || process.env.VITE_STRAVA_CLIENT_ID || '').trim();
    const clientSecret = (payload.client_secret || process.env.STRAVA_CLIENT_SECRET || '').trim();

    if (!clientId || !clientSecret) {
      return {
        statusCode: 400,
        headers: JSON_SECURITY_HEADERS,
        body: JSON.stringify({
          error: 'Missing Strava Client ID or Client Secret (set in Netlify env vars or in app Strava Settings).',
        }),
      };
    }

    if (payload.grant_type !== 'refresh_token' && payload.grant_type !== 'authorization_code') {
      return {
        statusCode: 400,
        headers: JSON_SECURITY_HEADERS,
        body: JSON.stringify({ error: 'Unsupported OAuth grant_type.' }),
      };
    }

    const body =
      payload.grant_type === 'refresh_token'
        ? {
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: String(payload.refresh_token || ''),
            grant_type: 'refresh_token',
          }
        : {
            client_id: clientId,
            client_secret: clientSecret,
            code: String(payload.code || ''),
            grant_type: 'authorization_code',
          };

    const upstream = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: JSON_SECURITY_HEADERS,
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: JSON_SECURITY_HEADERS,
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected proxy error' }),
    };
  }
}
