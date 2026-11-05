# SwiftMechanic

Android app (Vite + Capacitor 8) by yasmanyfmSoft. Describe a car problem or OBD-II code and get likely causes, checks, fixes and costs for your exact year / make / model / submodel / engine.

## Features
- **Vehicle**: year → make → model (NHTSA vPIC), submodel + engine/transmission (fueleconomy.gov), trim, mileage, or **VIN decode**. Multiple vehicles in a garage.
- **Diagnosis**: free-text problem (English or Spanish) + optional photo → urgency, safe-to-drive, ranked causes with how-to-check / fix / difficulty / cost, step-by-step plan, known issues, parts, follow-up chat.
- **OBD-II**:
  - Offline code library (`src/obd.js`): ~150 common generic codes + pattern rules (misfires, coils, injectors, O2 sensors) + structure decoding for any P/B/C/U code.
  - **Bluetooth LE scanner** (`src/obdlink.js`): ELM327-compatible BLE adapters (Vgate iCar Pro BLE, Veepeak BLE, OBDLink CX, vLinker BLE…). Reads stored/pending/permanent codes, MIL status, VIN, live data snapshot (fuel trims, temps, RPM, MAF, voltage…), clears codes.
- **NHTSA** recalls & owner complaints for the exact model, matched to the problem.
- **AI** (optional, user's own key, stored on device): Claude (default `claude-sonnet-5-5`) or Gemini. Without a key, an offline symptom guide (`src/kb.js`) answers.

## Build (PC Build Tool)
`.github/workflows/build.yml` runs on **workflow_dispatch** and publishes a GitHub Release with:
- `SwiftMechanic-<version>.apk` — debug build, install on phone
- `SwiftMechanic-<version>-release.apk/.aab` — signed, when these repo secrets exist:
  `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`

## Local dev
```
npm install
npm test        # offline analyzer + OBD parser tests
npm run dev     # browser preview (scanner works in Chrome via Web Bluetooth)
python3 scripts/make-icons.py   # regenerate icons/splash/store graphics
```

Store listing material: `store/` (icon, feature graphic, screenshots) and `PRIVACY.md`.
