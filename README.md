# Just Believe Fitness

**Live studio:** [jbfit.studio](https://jbfit.studio) · **Built by:** [John Bendfeldt](https://johnbendfeldt.com/)

A **100% local-first, privacy-first** 5-zone indoor cycling studio that connects **directly** over Bluetooth to **any Echelon stationary bike**, **standard FTMS smart bikes & trainers**, **Bluetooth power pedals**, or **BLE cadence sensors**, plus **any Bluetooth heart rate monitor** — with **zero accounts, zero paywalls, and zero middleman bridge apps**.

> **A quick wink before you click:** Yes, the internet is drowning in vibe-coded apps right now that either ask for your credit card on screen two or turn out to be a glossy landing page with a "Join the Waitlist" button. **This isn't that.** Open [jbfit.studio](https://jbfit.studio), pair your devices, drop in your stats, and ride. (And yes, it was built using **Gemini** and **Antigravity** — browse the commit history and you'll see we definitely didn't one-shot this.)

You don't have to download anything to ride. If you *do* want a full-screen app icon on your phone, tablet, or desktop, you can install it straight from Chrome/Edge (**Install app** / **Add to Home Screen**) — unlike multi-gigabyte 3D cycling apps, **it's tiny** (a lightweight React/Vite PWA with a zero-trap network-only service worker, and optional voice coaching clips fetched only if you turn them on).

No bike nearby? Open **Sensors** and flip on **Interactive Ride Simulator** to test live 5-zone gauges, Burn Points, the floating HUD, Photo Studio, and `.FIT` export immediately.

---

## The Standout Feature: Floating Telemetry HUD (Watch or Do Anything)

You don't need to stare at a cartoon avatar or stay trapped inside a subscription video player just to track a ride.

- **Pop-Out Picture-in-Picture HUD (Android & Desktop):** Pop out a live 5-zone floating overlay — **Power, Cadence, Heart Rate, zone-colored effort header, timer/distance countdown, and Burn Points** (in **Speedometer Rings** or **Horizontal Bars**) — and float it over **anything**: your signed-in ad-free YouTube app, Netflix, live sports, Twitch, podcasts, or your desktop while you work or browse. If you just want crisp, accurate stat tracking while you watch or do something else, this is built for it.
- **Built-In YouTube Theater:** Prefer one tab? Open **YouTube Split Cinema** or the **Corner Mini-Player** with saved ride video bookmarks right inside the studio.

---

## Garmin `.FIT` Export & Training Status (Keep Your Sanity While Cross-Training)

If you're sidelined from running or outdoor cycling with an injury and cross-training on an indoor bike, few things are more demoralizing than putting in real aerobic work only for Garmin to ignore your stationary bike and immediately slap you with **"Detraining."**

- **Genuine Binary Garmin `.FIT v2.0` Exporter:** Generates valid `.FIT` files right in your browser (with Power, Cadence, Heart Rate, Distance, Calories, Normalized Power, and `W/kg`) — plus an in-browser **`.TCX → .FIT` converter** for older rides.
- **Selectable `.FIT` Device Header Presets:** Choose **Garmin Edge 830**, **Tacx Training App**, **Zwift Virtual Ride**, or **Standard .FIT** so Garmin Connect actually computes **Training Load & Unified Training Status** from your indoor rides.
- **Garmin Connect Workflows (Zero Password Sharing, Zero Rate Limits):**
  - **Recommended (Phone & Desktop):** Export `.FIT` and upload directly at [Garmin Connect Import](https://connect.garmin.com/modern/import-data).
  - **Profile & History Sync:** Link Garmin's official read-only **Personal API (`GCDC_...`)** to import your weight, height, Max HR, FTP, and recent Garmin activities.
  - **Optional 1-Click Upload (Desktop Power Users):** Run `npm run garmin:token` locally from your residential IP to verify a session token in-browser.
- **Strava Sync:** Connect **1-click OAuth uploads** using your own free Personal API app from [strava.com/settings/api](https://www.strava.com/settings/api) (stored only in your browser so you never hit Strava's shared-app connected-athlete limit; includes a downloadable `256×256` PNG app icon), **or** skip API setup and upload your exported `.FIT`/`.TCX` file directly at [strava.com/upload/select](https://www.strava.com/upload/select). When both are linked, push to **Garmin**, **Strava**, or **Both** with automatic duplicate prevention.

---

## Supported Stationary Bikes & Sensors

- **All Echelon Smart Connect Bikes (`0bf669f0` / `0bf669f1`):**
  - **Motorized EX-Series (`31–33 lb` Heavy Flywheel + App Stepper Control):** **EX-3**, **EX-4s**, **EX-4s+**, **EX-5**, **EX-5s**, **EX-7s**, **EX-8s**, **EX-Pro**.
  - **Compact / Manual-Knob Series (`15 lb` Flywheel + Live Digital 1–32 Sensor):** **Connect Sport**, **Sport-s**, **EX-15**, **Connect Prime**, **EX-1 / EX-1LE**, **GT+**.
  - Speaks both the classic open handshake and **direct offline `0xF0 0xE0` challenge-response unlock for locked Echelon firmware** (zero Echelon app, subscription, or second device required), with post-auth verification and automatic flywheel curve & knob vs. motorized resistance detection. *(Tip: Force-close the official Echelon app before pairing, and avoid unnecessary firmware updates in case future updates introduce stricter locks.)*
- **Other Stationary Bike Brands (Standard Bluetooth FTMS `0x1826`, Cycling Power `0x1818`, & Cadence `0x1816`):**
  - **FTMS Bikes & Trainers (`0x2AD2` + optional `0x2AD9` resistance control):** **Schwinn IC4 / 800IC**, **Bowflex C6**, **Yesoul**, **Merach**, **Domyos**, **Keiser M3i** (with converter), **Stages**, **Wattbike**, **Concept2 BikeErg (`PM5`)**, **Renpho AI Bike**, **Zycle**, **Joroto**, **Wahoo KICKR**, **Garmin Tacx**, **Zwift Ride / Hub**, **Saris**, **Elite**, **JetBlack**.
  - **Power Meter Pedals & Cranks (`0x2A63` watts + crank cadence):** **Favero Assioma**, **Garmin Rally / Vector**, **4iiii**, **Stages**, **Quarq**, **Magene**.
  - **Bluetooth Cadence Pods (`0x2A5B`):** **Wahoo RPM**, **Garmin Cadence**, **Magene**, **Coospo** on any mechanical spin bike (with on-screen virtual gear estimation).
- **Universal BLE Heart Rate (`0x180D` / `0x2A37`):** Works with **Polar**, **Wahoo TICKR**, **WHOOP**, **COROS**, **Coospo**, **Scosche**, **Suunto**, **Garmin** (*Broadcast Heart Rate*), **Apple Watch** (via an HR broadcast app — see below), and any standard BLE strap, armband, or watch.

---

## Sorry, iPhone & iPad Riders (Extra Hoops & Workarounds)

First: **sorry for the extra hoops on iOS.** Apple forces all iPhone/iPad browsers onto WebKit and still blocks **Web Bluetooth** in Safari and Chrome on iOS, so direct bike pairing won't work in Safari/Chrome there. Here are your workarounds:

1. **Fastest Free Workaround — Bluefy Browser:** Install the free **Bluefy** browser from the iOS App Store and open `https://jbfit.studio` inside Bluefy to pair your bike and heart rate monitor over Web Bluetooth right away.
2. **Watching Video / YouTube on iPhone Without Dropping Bluetooth:** iOS/Bluefy blocks canvas Picture-in-Picture pop-out for the floating HUD. Instead:
   - Use the built-in **YouTube Split / Corner Mini-Player** right inside the app, **or**
   - For **ad-free YouTube Premium**, start your video in the native YouTube app, swipe home so YouTube drops into its system PiP window, then switch back to **Bluefy** so your Bluetooth connection stays live underneath.
3. **Apple Watch Heart Rate:** Apple Watch doesn't natively broadcast standard BLE heart rate. Open a lightweight HR broadcast app on your Apple Watch & iPhone — such as **HeartCast**, **ECHO Heart Rate**, or **BlueHeart** — then tap **Pair Heart Rate** in the studio.
4. **Native iOS App via Xcode (Free — No \$99 Developer Account Needed):** This repo includes a zero-rewrite **Capacitor 8 + CoreBluetooth** native iOS wrapper (`ios/` + `capacitor.config.ts`) with background BLE and native Keep Awake. If you have a Mac with Xcode, you can build and run it natively on your own iPhone/iPad for **\$0** with a free personal Apple ID — see [`docs/IOS_APP_STORE_RELEASE.md`](docs/IOS_APP_STORE_RELEASE.md).

*(Android phones/tablets and Windows/macOS/Linux Chrome or Edge work natively out of the box with zero workarounds.)*

---

## Studio & Workout Highlights

- **Ready Out of the Box + Instant Athlete Calibration:** Starts with approachable defaults (`5'8"`, `165 lbs`, `150W` FTP, `180 bpm` Max HR) and live-recalibrates every 5-zone arc, bar gauge, interval target, `W/kg` badge, and Burn Zone threshold to your stats.
- **Workouts & Distance Challenges (Defaults to Just Ride):**
  - **Open Studio:** **Just Ride** — hop on and spin immediately.
  - **Studio Workouts:** **23-Min Signature Burn**, **20-Min Burn Express**, **30-Min Power Pyramid**, and **20-Min FTP Test** (auto-calculates 95% FTP with a 1-click profile update — and automatically flags new 20-min FTP breakthroughs on any ride).
  - **Endurance Rides:** **45-Min YouTube Zone 2/3 Cruise**, **1-Hour**, **2-Hour**, and **3-Hour Endurance** (with standing saddle breaks and fueling cues).
  - **Distance Challenges:** **50K Challenge**, **50-Mile Half Century**, **Metric Century (100K)**, and **Full Century (100 Mi)**.
- **Three Cockpit Modes + Customizable Tiles & Icons:** Switch between **Speedometer Rings**, **Horizontal Zone Bars**, and **Full-Screen Focus Mode** (native fullscreen, guided interval coaching, dedicated Play/Pause transport, and customizable telemetry grid). Tap the **Layout** icon (`Customize Screen Layout`) to choose which metrics appear as your main tiles (for example, swap out Heart Rate for **Speed**, **Distance**, **Calories**, or **Avg Power**), pick a preset (**No Heart Rate**, **Clean 4-Tile**, **Heart Rate First**), or rearrange tiles and toolbar icons via modal controls or inline drag-and-drop — synced automatically across Main Studio, Focus Mode, and the Floating PiP HUD.
- **Opt-In Ambient Audio Coaching:** Synthesized voice cues and interval chimes played via the Web Audio API (`ambient` audio session) so they mix cleanly over Spotify, Apple Music, or podcasts without pausing your music. Off by default.
- **Post-Ride Photo Stat Studio:** Composite `1080×1350` camera/gallery/studio stat cards locally on an HTML5 `<canvas>` (photos never leave your device) and customize ride titles & notes.
- **100% Local-First Privacy (`/privacy` & `/terms`):** No user database, no analytics, no accounts. Profiles, settings, and ride history stay strictly in your browser's `localStorage` and `IndexedDB` unless you explicitly export or sync a ride.

---

## Open Source, Development & Native Builds

This project is open source — **take the code, edit it for your own setup, or fork it and make it even better.** PRs, bike-protocol tweaks, and bug fixes are welcome.

```bash
npm install
npm run dev          # Vite dev server + local /api/garmin-sync and /api/strava-token proxy
npm run verify       # Vitest suite + oxlint + tsc -b + Vite build + Chromium visual layout geometry audit
```

Additional scripts & guides:

- **Optional Self-Hosting Env Vars:** Copy `.env.example` if deploying to Netlify and optionally hosting your own Strava OAuth credentials server-side (`STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`).
- **Garmin Residential Session Token Helper:** `npm run garmin:token`
- **iOS Native Wrapper (Capacitor 8 + CoreBluetooth):** `npm run ios:sync` and `npm run ios:open` — see [`docs/IOS_APP_STORE_RELEASE.md`](docs/IOS_APP_STORE_RELEASE.md)
- **Android Google Play Store TWA Guide:** [`docs/PLAY_STORE_RELEASE.md`](docs/PLAY_STORE_RELEASE.md)

## License

Released under the [MIT License](LICENSE).
