# Decisions (things the plan did not specify)

## Hub (the one site that holds several apps)
- The hub is the folder above this one (`Hub/`; this app lives at `Hub/apps/fairshare`, moved there from `TripShare` after phase 5). It builds one site: a phone-style home screen at `/` and each app at `/<id>/`, from a list in `Hub/apps.json`. See `Hub/README.md` for adding apps. Nothing is deployed yet.
- **FairShare now builds for a sub-path.** `start_url` and `scope` are no longer fixed to `/` in `vite.config.ts`; the PWA plugin sets both to the build's base path. A normal build is unchanged (still `/`); the hub builds it with `--base=/fairshare/`, giving `/fairshare/` for both. Checked: manifest, icon links, service worker scope, full precache and offline use all work under `/fairshare/`, and its service worker does not take over the hub's home page.
- On Windows, passing `--base=/fairshare/` from **Git Bash** gets rewritten into a `C:/Program Files/Git/...` path. The hub's build script starts the build from Node, which avoids this. If you ever run that command by hand, use PowerShell or set `MSYS_NO_PATHCONV=1`.
- You said a cloud database is fine for some future apps. FairShare is unchanged: it stays offline-first with no server, as the plan says.

## Loading screen
- Opening a trip used to look frozen: the slide animation held a still picture of the old screen until the trip's data had loaded (up to 0.4 s), and only then played. Now the trip screen draws at once with a loading screen, so the slide starts on the tap, and the data fills in when ready.
- The loader is the hare popping out of its burrow, looking around (ears twitch) and ducking back in, on a loop (`BunnyLoader` in `src/ui.tsx`, plain SVG and CSS). It fades in only after 0.15 s, so a fast load shows no flash. Also used while the trip list loads. With Reduce Motion it is a still hare peeking out.
- Tested by holding the database busy for 1.5 s while a trip opens (`e2e/motion.spec.ts`).

## Dashboard, trip photos, motion and haptics
- **Dashboard:** trips in a two-column grid of cards (cover, name, currency); archived trips stay listed below. A round + button bottom right opens a "New trip" sheet (photo, name, currency); "Scan trip" and "Import trip file" moved into that sheet, under "Joining a trip from another phone?".
- **Trip photos stay on the phone that added them.** A new `photos` table (Dexie version 2), not synced and not in backups: a photo is far too big for the QR codes. The other phone shows the hare until a photo is added there too. Stored as JPEG bytes, shrunk to 800 px, not as a Blob: WebKit's IndexedDB refused Blobs in testing ("Error preparing Blob/File data"), and iOS Safari has had the same bug. Change or remove it in the trip's Members tab.
- **Haptics:** iOS web apps have no vibration API, but since iOS 18 toggling an `<input type="checkbox" switch>` gives a light haptic tick. A hidden one is toggled on every button press (`src/haptics.ts`); Android uses `navigator.vibrate`. **Cannot be tested on Windows: check on the iPhone.** If it does nothing there, the visual press states still work.
- **Motion:** opening and closing a trip slides like an iOS push, with the trip's cover gliding between its card and the header (view transitions, Safari 18). Cards rise in one after another, sheets slide up, the + pops in and its + turns when pressed, tab content rises in, the hare bobs on empty screens and covers, "All settled" pops with a hopping 🐇, and errors give a small shake. Buttons spring back after a press.
- **Reduce Motion** (iPhone setting) turns every animation and the slide off. The e2e tests run with Reduce Motion on so they are not timing-dependent; `e2e/motion.spec.ts` runs with motion on and checks the transitions run and the app is usable when they end. A tap during the 0.4 s slide is ignored, as on iOS itself.

## Crop before reading
- After picking photos, each one opens a crop screen (`src/receipt/CropSheet.tsx`): drag the corners (or the box) so only the receipt is inside, Rotate if sideways, then "Read receipt"; "Use whole photo" skips the crop. With several photos it asks for each in turn ("1 of 3"). Added because a receipt that is small in a photo full of table reads badly or not at all.
- Done with plain pointer events on a canvas, no library. The photo is kept at up to 3000 px on its long side and the browser applies the camera's rotation (EXIF). Dragging needs a finger or mouse; "Use whole photo" is the way to skip it for anyone who cannot drag.
- Tested in WebKit with a mouse (drag, rotate, cancel). **Not tested with a real finger**; check on the iPhone that the corner grips are easy to grab and the page does not scroll while dragging.

## Receipt accuracy, measured on your 7 receipt photos
- **Method:** the app's own reader and parser, run in WebKit on each photo, scored against the receipts read by eye. The harness is not kept in the repo; the real OCR text of four receipts is (`src/receipt/ocr-samples.json`, names and card numbers removed) and `parse.test.ts` checks the parser against it.
- **Result:** items found went from 8 of 32 to 20 of 32, wrong items from 20 to 10. On the five full-size photos it is 20 of 23; the misses are digits the engine misread (82.00 as 62.00, 321.00 as 21.00).
- **What fixed it (parser only):** a space is no longer a thousands separator ("@33.50 100.50" had become 50,100.50); the name can come from the line above (supermarket "name / qty barcode price amount" layout, Japanese "@680 x 2 ¥1,360"); dates, times, card/ATM, VAT sales, points, "No." and phone lines are skipped; yen prices under 10 are ignored; 外/内 after a yen price is allowed.
- **Image clean-up was measured and not added:** grayscale + contrast and 2x upscaling gained at most 1 item and added wrong ones. The two small Japanese images (338x450 and 216x464 pixels) are too small for any OCR; a real iPhone photo is about 10x the pixels. Japanese accuracy needs testing with real phone photos.

## After phase 6: several receipts per expense
- "Scan receipts" takes several photos at once (several receipts, or a long receipt in parts). They are read one after another with one engine, items from all of them go into the same list, and their totals are added up into Amount. Scanning again later adds more. Once the user types their own Amount, scans add items but leave the amount alone. A photo with no prices is reported ("No prices found on photo 2 of 3") and the others are still added.
- **OpenScanner was looked at and not used.** It is a native iPhone app (Swift), not a library, so a web app cannot include it. A clean scan made in such an app can still be used: save it to Photos as an image, then pick it in Scan receipts. Built-in clean-up (crop, straighten, contrast) would need OpenCV in the browser (about 8 MB more); the measurement below found simple clean-up does not help, so it is not added.

## After phase 6: receipt language packs
- **Receipt language** picker on the expense sheet: English (built in), Japanese and Tagalog. The choice is remembered on the device (`localStorage`, a UI preference, not trip data).
- **Japanese and Tagalog are downloaded on request** ("Download pack", 2 MB and 3.3 MB). **This is the app's one network call, made only when the user taps Download**, which goes beyond the plan's "no network calls"; you asked for downloadable packs. The files are hosted with the app (`ocr/jpn.traineddata.gz`, `ocr/tgl.traineddata.gz`), not precached, and kept in an `ocr-packs` cache that the service worker serves from, so a downloaded pack works offline (tested: download, shut the server down, scan a Japanese receipt). No remove-pack button yet; deleting the site's data removes them.
- Packs: `@tesseract.js-data/jpn` 1.0.0 (best_int) and `@tesseract.js-data/tgl` 1.0.0 (only the larger 4.0.0 format exists for Tagalog), pinned. Each is read together with English (`jpn+eng`), since receipts mix in English words and codes; that is a little slower than one language.
- **Parser:** Japanese totals (合計, お会計), subtotal (小計) and skip words (税, お預り, お釣り, 現金, 値引, ...); Tagalog (kabuuan, buwis, bayad, sukli, diskwento). Prices may be `¥980`, `\980` (old receipt fonts print ¥ as \) or `980円`; full-width digits are normalised; the space Japanese OCR puts between characters is removed; a single kanji (水) counts as a name; a time like 12:31 is not read as a price.
- In tests the Japanese reader read ラーメン as フーメン: prices and the total were right, names may need a fix by hand.

## After phase 6: receipt scanning
- **"Scan receipt"** on the expense sheet opens the iPhone photo picker (Take Photo or the library, no live camera, so none of the phase 4 camera problems). Text is read on the phone, turned into item lines, the total fills Amount, and the sheet switches to Items. Every line stays editable; nothing is saved until Save. Works in Airplane Mode (tested offline in e2e). The photo is never stored.
- **Library, approved by you:** `tesseract.js` 7.0.0 with `@tesseract.js-data/eng` 1.0.0 (the 3 MB "best_int" English data), pinned. Only the SIMD engine build is shipped (WebAssembly SIMD is in every iPhone since iOS 16.4; iOS 18.7.8 is the target), which keeps the extra precache to about 7 MB. The OCR code loads only when someone scans.
- **Offline wiring:** the worker and engine are Vite `?url` assets. The language file has to keep its name (tesseract.js looks it up in a folder), so a small plugin in `vite.config.ts` serves it in dev and emits it as `ocr/eng.traineddata.gz`. Handing tesseract.js the bytes directly would avoid the plugin, but 7.0.0 has a bug there (it uses the bytes as the language name). Workbox's size limit is raised to 6 MB for these files.
- **Parsing** (`src/receipt/parse.ts`, pure, tested): a line counts as an item when it ends in a price and its name has letters. In currencies with cents the price must show them, which drops table numbers, quantities and phone numbers. Subtotal, tax, VAT, service, tip, discount, cash, card, change and similar lines are skipped (their effect is in the total, shared by what each person had). The last "Total / Amount due" line is the total. Photos are scaled to 2000 px on the long side first.
- **Accuracy is the open question.** Clean prints read well in tests; crumpled thermal paper, low light and handwritten bills will need fixing by hand. If real receipts come out poorly, the first things to try are the photo size (`MAX_SIDE` in `src/receipt/ocr.ts`) and the skip-word list in `parse.ts`.

## After phase 6: split by item
- **You asked for it (version 2 feature).** A fifth split mode, "Items": each receipt line is split equally among the people tapped for it; whatever is left of the total (tax, tip, service) is shared in proportion to what each person had, and a total below the item sum is a discount shared the same way. "Use items total" fills the amount.
- **Stored as exact amounts plus the item list.** `splitInputs` holds each person's amount in the expense currency (as in Exact), so balances, settle-up, sync and the PDF are unchanged; the new optional `items` field keeps the lines so editing shows them again. `itemSplit` in `src/engine/split.ts` is pure and property-tested (always sums to the total, never negative).
- **Sync between versions:** a phone still on an older version rejects a trip containing an "Items" expense as damaged. Update both phones (tap Reload on the update banner) before syncing.
- The PDF lists the expense as before, not its items.

## Phase 6
- **Hare mark:** two identical upright ears, one head, one dot eye (`public/icon.svg`; the same shapes are the `Hare` component in `src/ui.tsx` and are drawn by hand in the PDF header). Icons are regenerated with `node scripts/make-icons.mjs`. Shown on the icon, the trip-list header, the "No trips yet" / "No expenses yet" empty states and the PDF header.
- **Wordmark** is now `fairs` + accent-coloured `hare` (it was bolding "share").
- **Tokens and polish:** font sizes are `rem` so iOS text scaling applies; a visible focus ring; press states were already in place; `prefers-reduced-motion` turns the press shrink off.
- **Accessibility gate:** `@axe-core/playwright` 4.13.0 (dev only, not in the plan's stack table) runs WCAG 2 A/AA rules over every main screen in `e2e/a11y.spec.ts`; it must show no critical or serious findings. Automated checks only cover part of accessibility, so still try VoiceOver once on the iPhone.
- **Splash:** no custom iOS launch images; iOS shows the manifest background colour and icon.
- **Deploy:** Vercel, from the repo's `main` (see the repo-root `vercel.json`).
- **Still needs people:** the real two-person trip on iPhones, from install to PDF (the phase 6 gate).

## Phase 5
- **You said to assume, so these are my assumptions:** the report covers Latin, Greek and Cyrillic plus currency symbols; and `pdfjs-dist` 6.4.299 is added as a **test-only** dev dependency (not in the plan's stack table) so the test can read the text back out of the PDF and compare it with the engine. Say so if you would rather not have it and I will test the data going into the PDF instead.
- **Font:** DejaVu Sans, regular weight only (open Bitstream Vera licence, copied to `src/report/` with its licence file; I checked its glyph table: it has `₱ ₹ € £ ¥ ₩`, `−`, accents, Vietnamese, Greek and Cyrillic). It is inlined into the lazy PDF chunk, so loading it makes no request. Only one weight is embedded, so emphasis is by size and colour. A report of a small trip is about 65 KB.
- **Not covered:** Chinese, Japanese, Korean, Thai, Arabic, Hebrew, Indic scripts and emoji. Those need very large fonts and, for Arabic, Thai and Indic, text shaping that jsPDF does not do. Such characters print as `?`, and the app and the PDF both say so. Names in those scripts are still fine in the app itself.
- **What the report holds:** header (trip name, number of expenses, total, members, date), expense ledger (date, title, paid by, amount in its own currency, converted amount; foreign expenses show the typed rate), per-member paid / owed / balance, settle-up sentences ("Ana pays Ben PHP 150.00") or "All settled", and a "Payments already made" list when there are any (not in the plan, added because balances include them). Every figure comes from the same `balances` and `settleUp` functions as the Settle up tab. Deleted records are left out. The wordmark in the header has "hare" in the accent colour; the hare is drawn beside it (phase 6).
- **Sharing is two taps.** "Create PDF" builds it, then "Share PDF" calls `navigator.share` straight from a tap (iOS refuses it after a delay). "Download PDF" is always offered, and is the only button where the browser has no share sheet. A prepared PDF is thrown away as soon as the trip changes, so it can never be out of date.
- **File name:** the trip name with anything other than letters, numbers and `-` turned into `_` (so "Offline trip" gives `Offline_trip.pdf`), same style as backups.
- **jsPDF's optional parts are stubbed.** It can lazily pull in `html2canvas`, `dompurify` and `canvg` for features this app never uses; they are aliased to an empty module in `vite.config.ts`, which keeps about 370 KB out of what phones download and cache. If you ever want jsPDF's HTML or SVG import, remove the alias.
- **Dev server:** `jspdf`, `jspdf-autotable` and `barcode-detector/ponyfill` are in `optimizeDeps.include`. Without it Vite finds them mid-session and reloads the page, which made unrelated e2e tests fail on the first run after installing.
- Added dependencies, all pinned: `jspdf` 4.2.1, `jspdf-autotable` 5.0.8, and dev-only `pdfjs-dist` 6.4.299.

## Phase 4
- **One format for backup, file sync and QR.** The `.fairshare` file is now version 2: the phase 3 backup plus a `sum` (SHA-256 of the trip body, first 8 bytes in hex). Version 1 files from phase 3 still import (no checksum to check). This replaces the phase 3 rule "restore refuses a trip already on the device": importing is now always a merge, shown in a preview ("3 new, 1 updated, 1 deleted") and only written on Apply. Importing the same file twice says "Already up to date".
- **Merge rules** (`src/sync/merge.ts`, pure): per record the higher `ver` wins, equal `ver` goes to the larger `deviceId`; wall time is never read. The trip's `clock` becomes the highest `ver` seen anywhere, so a write made after a merge always outranks what was merged.
- **Case the plan did not cover:** a member deleted on one phone but used by an expense or payment from the other is kept, as inactive, instead of leaving records pointing at nobody. It is worked out from the merged set, so both phones get the same answer.
- **Preview counts** members, expenses and payments; a trip rename or archive counts as one "updated"; records that arrive already deleted are not counted. A trip not on the phone yet says so.
- **QR frames** are `FS1.<id>.<index>.<count>.<base64>`, deflated with pako. `FRAME_CHARS = 600` follows the plan's "about 600 bytes", which makes a version-19 QR (101 modules wide). A 60-expense trip is 7 frames. **If the iPhones scan poorly, lower `FRAME_CHARS` in `src/sync/payload.ts` (about 400 gives a lighter code and about 11 frames).** Frames display for 300 ms each and the scanner reads every 120 ms; both are constants.
- **Limits:** 2 MB for a file and for the inflated data, 500 frames. Inflating is streamed with that cap, so a small crafted code cannot expand into gigabytes. A frame from a different trip restarts the collection.
- **Scanner:** `barcode-detector` 3.2.2 (ponyfill, always used rather than the native API, so every iPhone behaves the same). **By default it downloads its WASM from jsDelivr, which breaks offline use.** The WASM is bundled with Vite's `?url`, precached (about 1 MB, `wasm` added to the Workbox glob), and the scanner code is a lazy chunk. An e2e test fails if any request leaves localhost; I checked it fails when the override is removed.
- Added dependencies, all pinned: `pako` 3.0.2 and `@types/pako` 3.0.0, `qrcode.react` 4.2.0, `barcode-detector` 3.2.2, and `zxing-wasm` 3.1.3 (barcode-detector's own engine, needed to import its WASM file; same version barcode-detector depends on).
- **Camera:** everything runs in one modal with no route change. The camera starts only from a "Start camera" tap, and `getUserMedia` is called straight from that tap. If it fails, the same modal offers photos (several at once, any order) or a `.fairshare` file. A rejected payload does not stop scanning.
- **Where it lives:** a fourth "Sync" tab in a trip (show QR codes, scan, import file) and "Scan trip" / "Import trip file" on the trip list. Inside a trip, receiving refuses a different trip's data and points to the trip list. "Back up trip" stays in Members.
- **E2E cannot use a real camera.** The QR test screenshots each code on phone A (Playwright steps the display clock) and gives the PNGs to phone B's photo import in a scrambled order with repeats. This runs the real display, WASM decoder, reassembly and merge preview, but not the live camera. That is what the iPhone check is for.
- Not built: screen wake lock while showing codes, display speed control, pause/step. Add if the iPhone run shows the screen dimming or frames being missed.

## Phase 3
- **No Lighthouse.** Lighthouse 12 removed its PWA/installable category, so the gate can't use it. The e2e test checks the same things directly (manifest fields, 192/512 PNG icons, Apple touch icon link, service worker controlling the page). Chrome DevTools > Application > Manifest can confirm installability by hand if wanted.
- **Offline gate uses a real shutdown.** Playwright's WebKit `setOffline` crashes reloads under a service worker, so the test serves `dist/` from its own Node server, closes it, then reloads. It also checks every built file is in the precache.
- Added dev deps: `vite-plugin-pwa` 2.0.0, `workbox-build` 7.4.1, `@types/node`; `workbox-window` 7.4.1 as a dependency (the update prompt uses it).
- Icons are a placeholder hare (`public/icon.svg`, rendered to PNG by `node scripts/make-icons.mjs`). Replaced by the real hare in phase 6.
- Update prompt: `registerType: 'prompt'`, so a new version waits until the user taps Reload.
- Install hint: shown only on iOS Safari (not Chrome/Firefox on iOS, not once installed); dismissal is remembered in `localStorage`, which is a UI preference, not trip data.
- `.fairshare` backup is one trip per file and includes soft-deleted records. Restore only adds a trip that is not already on the device and refuses otherwise; merging into an existing trip arrives with sync in phase 4.
- Backup downloads via a Blob link. Sharing through the iOS share sheet is left to phase 5.

## Phase 2
- "Workflow A" from the spec was not in the plan text, so the e2e test defines it as: create trip, add 3 members, add an equal-split expense, check balances, mark both settle-up payments as paid, see "All settled". Swap in the real steps if they differ.
- `@playwright/test` (1.63.0) added; `npm run test:e2e` runs WebKit with the iPhone 14 profile against the Vite dev server. `npm test` stays unit-only.
- Writes go through `src/store.ts`; each write bumps the trip's `clock` and stamps the record's `ver`, `deviceId`, `updatedAt` in one transaction. Deletes are soft (`deleted: true`).
- Trip rename and archive live at the bottom of the Members tab; archived trips are restorable from the trip list.
- Percent is typed as a decimal ("33.33", max 2 places); shares are whole numbers; members left blank or 0 are excluded from the split.
- Base currency defaults to PHP in the new-trip form. Currency list comes from `Intl.supportedValuesOf('currency')`.
- A permanent "Saved on this device" note sits under the tab bar (plan: replaces the offline badge).
- Inactive members stay in lists as "Inactive · Reactivate" and drop out of new expense forms.

## Phase 1
- Old prototype `TripShare.html` was left untouched at first; it was removed after phase 4 as unused.
- `splitInputs[].value` is a non-negative integer in every mode: equal ignored, shares = whole shares, percent = hundredths of a percent (10000 = 100%), exact = minor units in the expense currency.
- Equal split is largest-remainder with all weights 1, which gives the "leftover to members in ID order" rule.
- Exact amounts in a foreign currency are scaled to `baseAmountMinor` by largest remainder, so `owed[]` still sums exactly.
- Member IDs sort with plain `<` (not `localeCompare`) so two phones agree.
- Currency decimals come from `Intl.NumberFormat` (2 for USD/PHP, 0 for JPY, 3 for KWD); rate math uses BigInt.
- `trips` also has `archived`; `device` is keyed by `deviceId`; `deleted` is not indexed (booleans are not valid IndexedDB keys).
- Payments are in the trip base currency.
- Dev dependency `fake-indexeddb` added to test Dexie under Node. Not in the plan's stack table.
