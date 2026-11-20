# Just Believe Fitness

A **100% local-first, privacy-first** 5-zone color-coded indoor cycling studio PWA (`jbfit.studio`) built for **Android phones/tablets** and desktop Chrome — connecting **directly** to **any Echelon stationary bike**, **standard FTMS smart bikes & trainers**, **Bluetooth power pedals**, or **BLE cadence sensors**, plus **any Bluetooth heart rate monitor**, with **zero accounts, zero paywalls, and zero middleman bridge apps**.

## Supported Stationary Bikes & Sensors

- **All Echelon Smart Connect Bikes (`0bf669f0` / `0bf669f1`):**
  - **Motorized EX-Series (`31–33 lb` Heavy Flywheel + App Stepper Control):** **EX-3**, **EX-4s**, **EX-4s+**, **EX-5**, **EX-5s**, **EX-7s**, **EX-8s**, **EX-Pro**.
  - **Compact / Manual-Knob Series (`15 lb` Flywheel + Live Digital 1–32 Sensor):** **Connect Sport**, **Sport-s**, **EX-15**, **Connect Prime**, **EX-1 / EX-1LE**, **GT+**.
  - Speaks both classic open handshake and **direct offline `0xF0 0xE0` challenge-response unlock for locked Echelon firmware** (zero Echelon app, subscription, or second device required), with post-auth verification and automatic flywheel curve & knob vs. motorized resistance detection. *(Tip: Still avoid unnecessary firmware updates in the official Echelon app in case future updates introduce stricter locks.)*
- **Other Stationary Bike Brands (Standard Bluetooth FTMS `0x1826`, Cycling Power `0x1818`, & Cadence `0x1816`):**
  - **FTMS Bikes & Trainers (`0x2AD2` + optional `0x2AD9` resistance control):** **Schwinn IC4 / 800IC**, **Bowflex C6**, **Yesoul**, **Merach**, **Domyos**, **Keiser M3i** (with converter), **Stages**, **Wattbike**, **Concept2 BikeErg (`PM5`)**, **Renpho AI Bike**, **Zycle**, **Joroto**, **Wahoo KICKR**, **Garmin Tacx**, **Zwift Ride / Hub**, **Saris**, **Elite**, **JetBlack**.
  - **Power Meter Pedals & Cranks (`0x2A63` watts + crank cadence):** **Favero Assioma**, **Garmin Rally / Vector**, **4iiii**, **Stages**, **Quarq**, **Magene**.
  - **Bluetooth Cadence Pods (`0x2A5B`):** **Wahoo RPM**, **Garmin Cadence**, **Magene**, **Coospo** on any mechanical spin bike (with on-screen virtual gear estimation).
- **Universal BLE Heart Rate (`0x180D` / `0x2A37`):** Works with **Polar**, **Wahoo TICKR**, **WHOOP**, **COROS**, **Coospo**, **Scosche**, **Suunto**, **Garmin** (*Broadcast Heart Rate*), and any standard BLE strap, armband, or watch.

## Studio Highlights

- **Safe Starter Defaults & Instant Athlete Calibration:** Starts with approachable recreational defaults (`5'8"`, `165 lbs`, `150W` FTP, `180 bpm` Max HR) and recalibrates every 5-zone speedometer arc, bar gauge, interval target, `W/kg` badge, and Burn Zone threshold to your profile.
- **Full-Screen Focus Cockpit, Ring Grid & Bar Modes:** Switch between **Speedometer Rings**, **Horizontal Zone Bars**, and **Full-Screen Focus Mode** (guided interval coaching + dedicated Play/Pause transport + 4-grid telemetry).
- **YouTube Split Cinema + Native PiP Telemetry HUD:** Watch YouTube side-by-side or pop out a live 5-zone Picture-in-Picture HUD overlay.
- **Post-Ride Photo Stat Studio + Zwift-Style Garmin & Strava Sync:** Composite `1080×1350` camera/selfie/studio stat cards, export `.TCX` files, and push workouts to **Garmin Connect**, **Strava**, or **Both** (with automatic duplicate prevention).
- **Privacy First (`/privacy` & `/terms`):** Workouts and profiles stay in your browser's `localStorage` and `IndexedDB` unless you explicitly sync a ride.

## Development & Release Verification

```bash
npm install
npm run dev
npm run verify   # Runs Vitest suite + oxlint + TypeScript + Vite production build
```
