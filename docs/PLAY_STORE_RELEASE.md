# Google Play Store Release Guide (Trusted Web Activity / TWA)

`jbfit.studio` is pre-configured for a **Google Play Store** release as an Android **Trusted Web Activity (TWA)**. Because a TWA runs Chrome under the hood, **Web Bluetooth, PiP, Fullscreen, IndexedDB, and Netlify auto-updates** all work with zero native rewrite.

---

## 1. Prerequisites
- A Google Play Console developer account (\$25 one-time registration).
- Verify that the live deployment serves:
  - `https://jbfit.studio/manifest.webmanifest`
  - `https://jbfit.studio/sw.js`
  - `https://jbfit.studio/.well-known/assetlinks.json`
  - `https://jbfit.studio/privacy` (Privacy Policy URL required by Google Play)

---

## 2. Generate the Android App Bundle (`.aab`)
### Option A — PWABuilder (easiest, browser-based)
1. Open [pwabuilder.com](https://www.pwabuilder.com/) and enter `https://jbfit.studio`.
2. Click **Package for Stores -> Android -> Store Package**.
3. Use these recommended settings:
   - **Package ID:** `studio.jbfit.app`
   - **App name:** `Just Believe Fitness`
   - **Short name:** `Just Believe`
   - **Host:** `jbfit.studio`
   - **Start URL:** `/`
   - **Display mode:** `standalone`
   - **Signing key:** Let PWABuilder generate a new signing key (save the downloaded `.keystore` and passwords securely — you need them for future Play Console updates).
4. Download the zip containing your `.aab` bundle and `assetlinks.json`.

### Option B — Bubblewrap CLI
```bash
npx @bubblewrap/cli init --manifest=https://jbfit.studio/manifest.webmanifest
npx @bubblewrap/cli build
```

---

## 3. Remove the Chrome Address Bar (`assetlinks.json`)
1. Upload the `.aab` to a **Closed Testing** track in Google Play Console.
2. In Play Console, go to **Setup -> App signing** (or **Test and release -> Setup -> App signing**) and copy the **SHA-256 certificate fingerprint** for the **App signing key** (and optionally your Upload key for local sideload testing).
3. Replace the placeholder inside `public/.well-known/assetlinks.json` with your SHA-256 fingerprint(s), commit, and push to `main`:
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "studio.jbfit.app",
         "sha256_cert_fingerprints": [
           "AA:BB:CC:..."
         ]
       }
     }
   ]
   ```
4. Once Netlify deploys, verify `https://jbfit.studio/.well-known/assetlinks.json` returns `200 OK` with `Content-Type: application/json`. The Android app will now launch in true full-screen mode with no URL bar.

---

## 4. Google Play Console Questionnaire Answers
- **Privacy Policy URL:** `https://jbfit.studio/privacy`
- **Data Safety:**
  - *Does your app collect or share any of the required user data types?* -> **No** (all athlete profile, ride history, and tokens stay locally on the user's device; optional Strava/Garmin sync is user-initiated).
- **App Access:** All functionality is available without special login credentials (riders can test immediately with **Simulate**).
- **Ads:** No, my app does not contain ads.
- **Target Audience:** 13+ / General audience (Health & Fitness).
- **Closed Testing (new personal accounts):** Google requires 12 opted-in testers for 14 continuous days before granting Production release access.

---

## 5. Privacy-First Monetization Notes
- **Simplest (Zero Backend):** Set the Play Store listing price to a one-time **\$4.99–\$9.99** purchase. Google handles receipts on-device — zero accounts, zero tracking, zero subscriptions.
- **Optional Future Upgrade:** Keep the app free and add a single one-time Google Play Billing unlock via the TWA **Digital Goods API** if you later add optional Pro features.
