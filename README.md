# Just Believe Fitness (JBF)

A 5-zone color-coded indoor cycling studio PWA built for **Android phones/tablets** and desktop Chrome — connecting **directly** to an **Echelon EX-3** bike and **Garmin** heart rate broadcast over Web Bluetooth with **zero middleman bridge app**.

## Highlights

- **Athlete-Oriented Telemetry Display:** Enter your height, weight, FTP, and Max HR (pre-configured for `5'9"`, `168 lbs`, `257W` FTP, `196 bpm` Max HR) and every 5-zone speedometer arc, bar gauge, target Watt block, `W/kg` badge, aerodynamic speed estimate, and Burn Zone threshold immediately calibrates to you.
- **Direct Echelon EX-3 Bluetooth (`0bf669f1...`):** Speaks Echelon's GATT protocol directly (both classic handshake and post-update `0xF0 0xE0` challenge-response + 2s keepalive + auto-reconnect) and computes live Watts via the Vector-pedal-calibrated EX-3 32-level power curve.
- **Direct Garmin Heart Rate (`0x180D` / `0x2A37`):** Pairs directly with Garmin watches in *Broadcast Heart Rate* mode or any BLE HRM strap.
- **JBF 5-Zone Ring Grid & Segmented Bar Modes:** Switch anytime between the **2×2 / 4-Up Speedometer Ring Grid** (rounded 5-zone arcs around Power, Heart Rate, Cadence, and EX-3 Gear) and **Horizontal Zone Bar Cards**, complete with a solid color-changing Effort Ribbon, **Burn Points** counter (minutes in Orange Zone 4 + Red Zone 5), and a live color-coded rolling timeline graph.
- **YouTube + Picture-in-Picture Two Ways:**
  1. **Built-in YouTube Split Cinema & Corner PiP Mini-Player** right inside the studio (keeps Android Chrome in the foreground with Screen Wake Lock active).
  2. **Pop-Out Telemetry HUD PiP** (`HUD PiP` button) streaming live 5-zone speedometer rings into a floating Picture-in-Picture overlay on top of the native YouTube app.
- **Local History + `.TCX` Export + 1-Click Strava Push:** Saves 1-second streams locally in IndexedDB, downloads Garmin/Strava `.TCX` files (with `<Watts>`, `<Cadence>`, `<HeartRateBpm>`), and uploads directly to Strava via OAuth 2.0 (`POST /api/v3/uploads`).

## Quick Start (Local Development)

```bash
npm install
npm run dev
```

Run tests & production typecheck/build:

```bash
npm test
npm run build
```

## Deploying to Netlify & Running on Your Android Phone/Tablet

This repo includes a pre-configured `netlify.toml` (Node 24, `dist` publish directory, Web Bluetooth + Picture-in-Picture `Permissions-Policy` headers, SPA routing, and a `/api/strava-token` Netlify Function for CORS-free Strava OAuth):

1. **Import into Netlify:** In Netlify, click **Add new site → Import an existing project → GitHub** and select `JohnBendfeldt/just-believe-fitness`. Netlify will automatically detect `netlify.toml` (`npm run build` → `dist`).
2. **Install on Android:** Open your `https://<your-site>.netlify.app` URL in **Chrome on Android** and tap **Menu (⋮) → Add to Home screen / Install app**.
3. **Pairing Your Echelon EX-3:** Plug in the bike (flashing blue light) and make sure the official Echelon Fit app is force-closed so it isn't holding the Bluetooth connection. Tap **Pair Sensors → Pair Echelon EX-3**.
4. **Pairing Your Garmin Watch:** On your watch, open **Settings → Sensors / Wrist Heart Rate → Broadcast Heart Rate** and press Start, then tap **Pair Sensors → Pair Garmin HR**.

## Connecting 1-Click Strava Sync

1. Visit [https://www.strava.com/settings/api](https://www.strava.com/settings/api) and create a personal API application (starts immediately in Single-Player Mode for your account).
2. Set **Authorization Callback Domain** to your Netlify hostname (e.g. `your-site-name.netlify.app`, without `https://`).
3. Either add `VITE_STRAVA_CLIENT_ID`, `STRAVA_CLIENT_ID`, and `STRAVA_CLIENT_SECRET` in **Netlify → Site configuration → Environment variables**, *or* paste your **Client ID** and **Client Secret** directly inside **Rides → Configure Strava** and tap **Connect with Strava**.
