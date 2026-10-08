# FairShare build plan

Oct 5, 2026 · @mj

FairShare is an offline-first expense-splitting PWA for iPhone, built by an AI coding agent in six gated phases while you supervise.

## Scope

Version 1 covers the six use cases in the spec, plus the three choices you made: full split types, multi-currency with manual rates, and an agent-driven build.

| Area | In version 1 | Left out |
|---|---|---|
| Trips and members | Create, rename, archive trips; add, rename, remove members | Accounts, logins, invitations |
| Expenses | Title, amount, currency, payer, date, split by equal, exact, shares or percent | Receipt photos, categories, recurring expenses |
| Currency | One base currency per trip; each expense can use another currency with a rate you type | Live exchange rates |
| Settlement | Net balances and a simplified list of who pays whom; mark a payment as settled | Payment links, bank details |
| Sync | QR scan between phones, plus a file export/import fallback | Any server, cloud backup |
| Reports | PDF summary through the iOS share sheet | Spreadsheet export |
| Platform | Installable PWA, works fully offline, iPhone Safari first | App Store build, Android polish |

## Changes to the source spec

The two PDFs are a sound base, but eight points need changing before an agent builds from them. Two parts are also missing: the "Critical iOS PWA camera limitation" note is cut off, and Process 2 is absent from the architecture document.

| Spec says | Problem | Plan does instead |
|---|---|---|
| Use `html5-qrcode` for scanning | The library is in maintenance mode with no releases since April 2023 | Use `barcode-detector`, a ZXing WebAssembly polyfill of the Barcode Detection API |
| One compressed QR per trip | A single QR tops out near 2.9 KB of binary data, and dense codes scan poorly from a phone screen. A trip of 50+ expenses will not fit | Split the payload into a looping sequence of small QR frames with a progress counter; add file export/import as a fallback |
| Camera limitation (text missing) | Installed iOS web apps re-ask for camera permission on each launch, and the stream can break on route changes (WebKit bug 215884, bug 212040) | Keep the scanner in one modal with no route change, request the camera only on a tap, and offer "import from photo or file" when the camera fails |
| "Append missing items" on merge | Edits and deletions made on one phone never reach the other; deleted expenses come back | Every record carries a version counter and a deleted flag; merge keeps the higher version per record |
| Compare timestamps to resolve conflicts | Phone clocks differ, so the wrong edit can win | Use a per-trip logical counter (Lamport clock) with device ID as tie-break; wall time is display only |
| `navigator.storage.persist()` protects data | Safari deletes script-written storage after seven days without use unless the app is on the Home Screen; eviction under storage pressure can still happen | Still call `persist()`, but also show an "Add to Home Screen" prompt in Safari and a "Back up trip" file export |
| Wrap network calls in `navigator.onLine` | The app has no network calls after install, and `onLine` is unreliable | Drop the checks. The offline badge becomes a permanent "Saved on this device" note |
| Balances like +$30.00 | Floating-point money drifts by cents across splits | Store every amount as an integer in minor units; assign leftover cents by a fixed rule |

Smaller fixes: touch targets are 48 CSS pixels, not "48mm"; `inputmode="decimal"` should be used without `pattern="[0-9]*"`, which hides the decimal key; iOS Safari has no vibration API, so "haptic" feedback means visual press states only.

## Stack

The stack stays as specified except for the scanner, plus test tools the spec did not name. Pin exact versions in `package.json` so the agent cannot drift between phases.

| Job | Choice | Note |
|---|---|---|
| App shell | Vite, React, TypeScript (strict) | As specified |
| Local database | Dexie.js over IndexedDB, with `dexie-react-hooks` for live queries | No separate state library needed |
| Validation | Zod | Same schemas guard forms, imports and QR payloads |
| Offline shell | `vite-plugin-pwa` (Workbox), precache everything | No runtime network calls |
| Compression | `pako` (deflate) | As specified |
| QR display | `qrcode.react` | Medium error correction, frames of about 600 bytes |
| QR scanning | `barcode-detector` | Replaces `html5-qrcode` |
| PDF | jsPDF and `jspdf-autotable`, with an embedded Unicode font | The built-in fonts lack symbols such as ₱ and ₹ and all non-Latin names |
| Sharing | Web Share API with files; download link as fallback | Must run inside a tap handler |
| Styling | Plain CSS with custom properties | No UI kit; keeps the bundle small and the look your own |
| Navigation | Tab state in memory, no URL router | Avoids the iOS camera-stream bug on route change |
| Tests | Vitest, fast-check for property tests, Playwright with WebKit | Playwright runs the offline gate on Windows |
| Hosting | Any free static host with HTTPS | See open questions |

Windows cannot run iOS Safari. Playwright's WebKit catches most layout and offline bugs, but camera, share sheet, safe areas and Home Screen install need a real iPhone at the end of phases 3, 4 and 5.

## Data model and money rules

Five tables hold everything, and every synced record carries the same four sync fields. Getting this right in phase 1 is what makes sync and multi-currency safe later.

| Table | Key fields |
|---|---|
| `trips` | `id`, `name`, `baseCurrency`, `clock` (highest version seen) |
| `members` | `id`, `tripId`, `name`, `active` |
| `expenses` | `id`, `tripId`, `title`, `date`, `payerId`, `amountMinor`, `currency`, `rate`, `baseAmountMinor`, `splitMode`, `splitInputs[]`, `owed[]` |
| `payments` | `id`, `tripId`, `fromId`, `toId`, `amountMinor`, `date` (a settlement someone actually paid) |
| `device` | `deviceId`, settings; never synced |

Sync fields on trips, members, expenses and payments: `ver` (logical counter), `deviceId` (who wrote it), `deleted` (true or false), `updatedAt` (display only). All IDs are UUIDs made on the device.

Money rules the agent must implement exactly:

1. Amounts are integers in minor units (cents). The number of decimals comes from the currency: 2 for USD and PHP, 0 for JPY, 3 for KWD.
2. Each trip has one base currency. An expense in another currency stores the rate you typed as text, in the form "1 EUR = 65.20 PHP", and the converted `baseAmountMinor`, rounded half up once at save time.
3. Changing a rate later changes only that expense. A new expense in the same currency pre-fills the last rate used.
4. Splits are computed in base-currency minor units, so each expense's `owed[]` sums to `baseAmountMinor` exactly.
5. Equal split: divide, round down, then give the leftover units one each to members in ID order. The order is fixed so two phones always agree.
6. Shares and percent: use the largest-remainder method, ties broken by ID order. Percent inputs must total 100.
7. Exact amounts: typed in the expense currency and must total the expense amount; the form shows the remaining amount live.
8. Balance per member = paid − owed + payments sent − payments received. The balances of a trip always sum to zero.
9. Settle-up: repeatedly match the largest debtor with the largest creditor. This gives at most one fewer payment than there are members. It is not always the absolute minimum, which is acceptable.
10. A member with any expense or payment cannot be deleted, only marked inactive.

## Build phases

The build runs in six phases, one agent session each, and no phase starts until the previous gate passes. The spec's four phases skipped the screens themselves, so phase 2 is new and polish is split out as phase 6.

### Phase 1: Engine and schema

- **Agent builds:** Vite + React + TypeScript project; Dexie tables as in the data model; Zod schemas for every record; pure functions for conversion, the four split modes, balances and settle-up. No screens.
- **Gate:** `npm test` passes. Property tests over thousands of random trips show balances sum to zero, each `owed[]` sums to its expense, and applying the settle-up list brings every balance to zero.

### Phase 2: Core screens

- **Agent builds:** trip list, trip view with expense list, add/edit expense sheet with all four split modes and currency picker, members screen, Settle Up tab with "mark as paid". Bottom tab bar, safe-area padding, 48 px targets, decimal keypad, empty states.
- **Gate:** Playwright (WebKit, iPhone viewport) runs Workflow A from the spec end to end, plus one expense per split mode and one foreign-currency expense. You click through it yourself in a desktop browser.

### Phase 3: Offline and install

- **Agent builds:** web manifest, icons, Apple touch icon, service worker that precaches the whole app, update prompt, `persist()` request, "Add to Home Screen" hint shown only in Safari, and trip backup and restore as a `.fairshare` file.
- **Gate:** Playwright loads the built app, goes offline, reloads, and adds an expense with zero failed requests. Lighthouse reports it installable. On an iPhone: install, turn on airplane mode, reopen, data is still there.

### Phase 4: Sync

- **Agent builds:** in this order: (1) merge function, pure and tested; (2) payload format with schema version, trip ID, checksum; (3) file import through the same merge; (4) multi-frame QR display; (5) camera scanner that collects frames in any order; (6) preview screen showing "3 new, 1 updated, 1 deleted" before applying.
- **Gate:** tests prove merge gives the same result in either direction and when repeated, deletions stay deleted, and a corrupted or oversized payload is rejected without touching the database. On two iPhones: sync a 60-expense trip both ways.

### Phase 5: PDF report

- **Agent builds:** PDF with trip header, expense ledger, per-member totals, balances and settle-up list; embedded font; currency shown as code plus amount; share through the iOS share sheet with a download fallback.
- **Gate:** a test generates the PDF offline, checks it is a valid file and that the totals in it match the engine. On an iPhone: share to Files and AirDrop; names with accents and non-Latin letters render.

### Phase 6: Brand, polish, release

- **Agent builds:** hare mark and icon set, colour and type tokens applied, press states, error messages, accessibility pass (labels, contrast, text scaling), deployment to the static host.
- **Gate:** no critical accessibility findings in automated checks, full test suite green, and a real two-person trip run from install to PDF on iPhones.

## Supervising the agent

Your job is to keep each session narrow and to check the gate yourself rather than trust the agent's summary.

- Put this plan in the repository as `PLAN.md` and tell the agent to read it at the start of every session.
- Give one phase per session. Start with "Build phase N only. Do not start phase N+1."
- Have the agent write the gate tests first, then the code that passes them.
- Run `npm test` and `npm run build` yourself before accepting a phase. Commit and tag each passed gate so you can roll back.
- Reject any change that adds a network call, uses `localStorage` for trip data, stores money as a decimal, or writes user text with `innerHTML`.
- Do not let the agent swap a library from the stack table without asking you.
- Keep a short `DECISIONS.md` where the agent records anything it chose that this plan did not specify.

Phases 1 and 2 need only your Windows machine. Borrow or use an iPhone for the device checks in phases 3 to 6; phase 4 needs two.

## Brand direction

FairShare's mark is a minimal hare whose two ears are identical, upright bars: equal ears, equal shares. The drawing itself comes in phase 6; this section is the brief.

- **Mark:** a hare head built from three or four simple shapes, one colour, no outline detail, no face beyond at most a single dot eye. It must still read as a hare at 29 px, the smallest iOS icon size.
- **Wordmark:** `fairshare` in lowercase, with `hare` set in the heavier weight or the accent colour so the name inside the name shows once and quietly.
- **Colour:** off-white background, near-black ink, one accent. A soft meadow green suits both "fair" and "hare"; amounts owed and owing use ink plus a sign, not red and green alone.
- **Type:** the system font in the app, so it feels native and costs no download. The PDF embeds one open font for full character coverage.
- **Where the hare appears:** app icon, splash, empty states ("No expenses yet") and the PDF header. Not on every screen.
- **Voice:** plain and neutral about money. "Ana pays Ben ₱150", never "Ana is in debt".
- **Icon files:** a 180 px opaque PNG for the iOS Home Screen, 192 and 512 px for the manifest, and one SVG source.

## Open questions

- [ ] Which free host: GitHub Pages, Cloudflare Pages or Vercel? All work; the choice only affects the phase 6 deploy step. **Answer: use Vercel, the connected one.**
- [ ] Do you have two iPhones available for the phase 4 sync gate, and which iOS versions should count as supported? **Answer: it should work for iOS 18.7.8.**
- [ ] Should a trip's base currency be changeable after expenses exist? The plan assumes no.
- [ ] Is English the only interface language for version 1? **Answer: yes.**
- [ ] What did the cut-off "Critical iOS PWA camera limitation" note and the missing Process 2 say? If you have the full PDFs, the plan should be checked against them.

## Sources

- html5-qrcode repository notice: project in maintenance mode
- Quagga2 vs html5-qrcode, Scanbot: last release April 2023
- gix-components pull request 759: migration from html5-qrcode to barcode-detector
- WebKit bug 215884: camera permission not kept across sessions in installed web apps
- WebKit bug 212040: camera stream muted after route change in standalone mode
- Safari 13.1 seven-day storage cap, summary of WebKit's announcement
- MDN: storage quotas and eviction criteria

The two WebKit camera reports date from 2020 and 2021. Current iOS may behave better, which is why the phase 4 gate tests on real devices.
