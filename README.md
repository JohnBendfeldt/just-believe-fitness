# Just Believe Fitness (JB Fitness)

An Orangetheory & Garmin-inspired indoor cycling studio PWA built for **Android phones/tablets** and desktop Chrome — connecting **directly** to an **Echelon EX-3** bike and **Garmin** heart rate broadcast over Web Bluetooth with **zero middleman bridge app**.

## Highlights

- **Athlete-Oriented Telemetry Display:** Enter your height, weight, FTP, and Max HR (pre-configured for `5'9"`, `168 lbs`, `257W` FTP, `196 bpm` Max HR) and every 5-zone color bar, target Watt block, `W/kg` badge, aerodynamic speed estimate, and Splat threshold immediately calibrates to you.
- **Direct Echelon EX-3 Bluetooth (`0bf669f1...`):** Speaks Echelon's GATT protocol directly (both classic handshake and post-update `0xF0 0xE0` challenge-response + 2s keepalive + auto-reconnect) and computes live Watts via the Vector-pedal-calibrated EX-3 32-level power curve.
- **Direct Garmin Heart Rate (`0x180D` / `0x2A37`):** Pairs directly with Garmin watches in *Broadcast Heart Rate* mode or any BLE HRM strap.
- **Orangetheory + Garmin 5-Zone UI:** Solid color-changing Effort Ribbon, Splat Point counter (minutes in Orange Zone 4 + Red Zone 5), 5-segment Garmin zone bars for **Power**, **Cadence**, and **Heart Rate**, and a live color-coded rolling timeline graph.
- **YouTube + Picture-in-Picture Two Ways:**
  1. **Built-in YouTube Split Cinema & Corner PiP Mini-Player** right inside the studio (keeps Android Chrome in the foreground with Screen Wake Lock active).
  2. **Pop-Out Telemetry HUD PiP** (`HUD PiP` button) streaming live Power, Cadence, and Heart Rate gauges into a floating Picture-in-Picture overlay on top of the native YouTube app.
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

## Running on Your Android Phone or Tablet

Web Bluetooth (`navigator.bluetooth`) requires a secure context (`https://` or `http://localhost`):

1. **Zero-Config Private Cloud Deploy (Recommended):** Connect this private GitHub repo (`JohnBendfeldt/just-believe-fitness`) to **Cloudflare Pages**, **Vercel**, or **Netlify** (free tiers support private repos with automatic `https://` SSL). Open your `https://...` URL in **Chrome on Android** and tap **Menu (⋮) → Add to Home screen / Install app**.
2. **Pairing Your Echelon EX-3:** Plug in the bike (flashing blue light) and make sure the official Echelon Fit app is force-closed so it isn't holding the Bluetooth connection. Tap **Pair Sensors → Pair Echelon EX-3**.
3. **Pairing Your Garmin Watch:** On your watch, open **Settings → Sensors / Wrist Heart Rate → Broadcast Heart Rate** and press Start, then tap **Pair Sensors → Pair Garmin HR**.

## Connecting 1-Click Strava Sync

1. Visit [https://www.strava.com/settings/api](https://www.strava.com/settings/api) and create a personal API application (starts immediately in Single-Player Mode for your account).
2. Set **Authorization Callback Domain** to your app's hostname (e.g. `localhost` locally or your deployed `*.pages.dev` / `*.vercel.app` domain).
3. In JB Fitness, open **Rides → Configure Strava**, paste your **Client ID** and **Client Secret**, and tap **Connect with Strava**.
