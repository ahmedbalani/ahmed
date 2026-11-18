# APP.md — how the app is built (living document)

Update this file, including the changelog, with every code change.

## What it is
Single-file app: `index.html` (vanilla HTML/CSS/JS, no dependencies, no build).
Hosted on GitHub Pages from branch `main`, folder `/` → https://ahmedbalani.github.io/ahmed/
Modeled on samab1/big-gunz. Program source: "Ahmed's 5-Day Muscle Plan" (intermediate lifter, full gym, goal: muscle).

## Data model
- `DAYS` = [{k, t, sub, ex:[...]}] for push/pull/legs/upper/lower. Each exercise from `X(name, sets, lo, hi, big, cue, feel, primary, secondary, extra)`.
  `lo–hi` = rep range (double progression), `big` = 2–3 min rest (else 60–90 s), `extra.bw` = bodyweight OK, `extra.ss` = superset.
- Exercise id = `day-slug(name)`. ⚠️ Renaming an exercise changes its id and orphans its log history.
- `VID` maps id → YouTube ID, embedded via youtube-nocookie iframe when the card is open.
- Muscle map: `BODY` path data (MIT © 2022 ELABBASSI Hicham, react-native-body-highlighter — see THIRD_PARTY_LICENSES.txt), `SLUGMAP`, `bodyMap()`.

## Storage (localStorage, this phone only)
- `lift5Logs`: { id: [{d:"YYYY-MM-DD", t:ms, s:[{w,r,ok}]}] } oldest first, max 60 sessions per exercise.
- `lift5Day`: last tab. `lift5LastBackup`: date of last backup.
- Backup = downloads a JSON file; Restore merges by date (newest edit wins).

## Videos
Every ID was verified with `https://noembed.com/embed?url=https://www.youtube.com/watch?v=<ID>` (real channel + embeddable). Verify any new ID the same way before shipping.

| Exercise | ID | Channel |
|---|---|---|
| Barbell bench press | gRVjAtPip0Y | Buff Dudes |
| Incline DB press | QEY2z5LtB9Y | Coach Yuliya |
| Seated DB shoulder press | WKEl69bIGus | All Strength Training |
| Cable lateral raise | qghfvzcoS2I | Horton Barbell |
| Cable fly | DjM_nYgRhjE | Gmzperformance |
| Rope pushdown / cable pushdown | vPeQu_L-1n0 | REP |
| Overhead cable triceps ext. | grtDyGNMjQ0 | ThriveTraining |
| Pull-up or lat pulldown | AKl1em_pH_c | Murrali Gurram |
| Barbell row | Lf4LUL3FeUM | JamesFit |
| Seated cable row | oFtfkSElE0s | Hammer Fitness |
| Face pull | eTCBSFlCJ_s | NASM |
| EZ-bar curl | SDFZBaJcTsU | Travis Tarrant |
| Incline DB curl | rAx_tf13V5k | Average To Jacked |
| Hammer curl | CFBZ4jN1CMI | NASM |
| Back squat | irA7MTz96ho | Kelly Matthews |
| Romanian deadlift | uhghy9pFIPY | E3 Rehab |
| Leg press | K5n2vg3oZa4 | Colossus Fitness |
| Leg curl | SbSNUXPRkc8 | PureGym |
| Leg extension | 4zOky6-n78I | J2FIT |
| Standing calf raise | ucy86plaufg | MenoMojo |
| Incline barbell press | BjGLs6KGWUc | NASM |
| Chest-supported row | wvWCXvlKBfg | PSP Petawawa Military Fitness |
| Machine chest press | B-zyH8OTlsg | Hammer Fitness |
| Neutral-grip lat pulldown | lmmShS3KLB4 | Matt Klingler |
| DB lateral raise | XPPfnSEATJA | NASM |
| Cable curl | u9XtfyqeJd4 | OriGym |
| Deadlift / trap-bar deadlift | dfYIApfWS5o | Horton Barbell |
| Bulgarian split squat | -4LVK1crLSw | Squat University |
| Hack squat | 73uIfCey0ww | Humber College Athletics |
| Seated leg curl | G5iP_YcDQdE | NASM |
| Hip thrust | S_uZP4UH6J0 | Mind Pump TV |
| Seated calf raise | smyXy_dhXo8 | Fitness Lab |
| Hanging leg raise | -LHetdLNhjI | Testosterone Nation |

## Dev workflow
1. Edit `index.html`. 2. Extract the `<script>` body and run `node --check`. 3. Bump the "updated" date in the footer. 4. Commit + push to `main` (Pages redeploys in ~1 min). 5. Update this file.

## iPhone app (`iOS/`)
- `iOS/Lift.xcodeproj` (Xcode 16+ format, folder-synced: every file in `iOS/Lift/` is included automatically).
- `LiftApp.swift`: SwiftUI + WKWebView. Loads `siteURL` (GitHub Pages); on failure loads bundled `iOS/Lift/index.html`
  via `loadHTMLString(baseURL: siteURL)` so localStorage (same origin) is shared. Inline video playback on.
  External links open in Safari/YouTube. Pull-to-refresh reloads.
- Backup bridge: `backup()` in the page posts `{type:"backup", name, json}` to `window.webkit.messageHandlers.lift`;
  Swift writes a temp file and shows the share sheet. In Safari it falls back to a normal download.
- Bundle ID `com.ahmedbalani.lift`, free Personal Team signing (reinstall every 7 days). Steps in `iOS/README.md`.
- Keep `iOS/Lift/index.html` in sync with `index.html` when rebuilding.

## Changelog
- **2026-11-17** — v1: 5-day split, per-set weight/rep logging with last-time prefill, add-weight tips (double progression), rest timer, muscle maps, embedded verified form videos, history + heaviest set, backup/restore.
- **2026-11-17** — iPhone app wrapper in `iOS/` (WKWebView, offline fallback, share-sheet backup, dumbbell icon). Page `backup()` now uses the native bridge when present.
- **2026-11-17b** — Every exercise is now 4 sets (user request). Footer stamp 2026-11-17b. Older logs with fewer sets just won't trigger the add-weight tip until a full 4-set session is logged.
