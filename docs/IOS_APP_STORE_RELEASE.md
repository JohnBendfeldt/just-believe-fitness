# iOS Native Wrapper Guide (Capacitor + CoreBluetooth)

Because Apple's WebKit does not support Web Bluetooth in Safari or Chrome on iOS, this repo includes a zero-rewrite **Capacitor 8** iOS wrapper (`ios/` + `capacitor.config.ts`) that bridges the exact same Vite/React studio UI to native iOS **CoreBluetooth** (`@capacitor-community/bluetooth-le`) and native **Keep Awake** (`@capacitor-community/keep-awake`).

- **Zero impact on the web / Android PWA:** In browsers, `isNativeCapacitorPlatform()` is `false`, so `src/services/ble/bleTransport.ts` delegates directly to `navigator.bluetooth` and lazy-loaded Capacitor plugins are never executed or downloaded.
- **Full locked-Echelon & universal BLE support on iPhone/iPad:** All protocol drivers (`echelonBle.ts` including direct offline `0xF0 0xE0` locked-firmware unlock, FTMS, CPS, CSC, and `garminHrBle.ts`) run identically over CoreBluetooth.
- **Background BLE pre-configured:** `ios/App/App/Info.plist` already includes `NSBluetoothAlwaysUsageDescription`, `NSBluetoothPeripheralUsageDescription`, `UIBackgroundModes: [bluetooth-central]`, `NSCameraUsageDescription`, `NSPhotoLibraryAddUsageDescription`, and `ITSAppUsesNonExemptEncryption = false`.

---

## 1. Free Personal Testing on Your Own iPhone (No \$99 Membership Needed!)

You can test the native iOS app on your own iPhone/iPad for **\$0** before deciding whether to pay for an Apple Developer Program membership:

1. On a Mac with **Xcode** installed, clone the repo and run:
   ```bash
   npm ci
   npm run ios:sync
   npm run ios:open
   ```
2. In Xcode, select the **App** target -> **Signing & Capabilities**:
   - Check **Automatically manage signing**.
   - Pick your free personal Apple ID under **Team**.
   - If `studio.jbfit.app` is taken by another personal team, temporarily change Bundle Identifier to e.g. `studio.jbfit.app.dev`.
3. Plug your iPhone/iPad in via USB, select it as the Run destination, and press **Run (`⌘R`)**.
4. On the iPhone, go to **Settings -> General -> VPN & Device Management** and trust your developer certificate.
5. Open **Just Believe Fitness** and tap **Pair Bike** — native iOS CoreBluetooth will scan and pair directly with your Echelon/FTMS bike and heart rate monitor! *(Free Apple ID sideloaded builds last 7 days per sign; re-run from Xcode to refresh.)*

---

## 2. Publishing to TestFlight / Apple App Store (\$99/year)

When you're ready to distribute to other iPhone/iPad riders:

1. Enroll in the **Apple Developer Program** (\$99/year).
2. Replace `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` with a **1024×1024** opaque (no alpha transparency) PNG of the Just Believe Fitness icon.
3. Run `npm run ios:sync && npm run ios:open`.
4. In Xcode:
   - Set **Team** to your paid Apple Developer team and keep Bundle ID `studio.jbfit.app`.
   - Set **Version** and **Build** numbers.
   - Select **Any iOS Device (arm64)** -> **Product -> Archive** -> **Distribute App -> App Store Connect**.
5. **App Store Connect answers:**
   - **Support / Contact Email:** `dev@jbfit.studio`
   - **Privacy Policy URL:** `https://jbfit.studio/privacy`
   - **App Privacy:** Data Not Collected (all workouts, athlete stats, and optional OAuth tokens remain locally on device).
   - **Review Notes:** Explain that the app connects natively via CoreBluetooth to indoor cycling bikes (Echelon, FTMS, power meters, cadence sensors) and BLE heart rate monitors, records workouts offline, and exports `.FIT`/`.TCX` files — and that reviewers without a bike can test all features immediately via **Simulate Ride**.
6. **Optional iOS enhancements before public App Store launch:**
   - Configure a Universal Link / custom URL scheme if you want in-app Strava OAuth redirect inside the native iOS shell (Garmin `.FIT` export works offline out of the box).
   - Add `@capacitor/share` + `@capacitor/filesystem` if you want `.FIT`/`.TCX` downloads to open the native iOS Share Sheet directly.
