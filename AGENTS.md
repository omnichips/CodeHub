# Hub: instructions for coding agents

One website that is a pixel-art game launcher; each card is an app. Everything is generated from `apps.json`
(see README.md). The hub itself is `src/` (cards in `launcher.js`, animated wallpapers in `wallpapers.js`, the logo
loading screen in `splash.html`, which the build also puts at the top of every app's page, the self-hosted Press Start
2P font in `src/fonts/`). It must make no request to another site (an e2e test checks this). Live site: https://chips-codehub.vercel.app/ — repo: https://github.com/omnichips/CodeHub.git (public).

| App | Path | Live | Kind |
|---|---|---|---|
| FairsHare (expense splitting, receipt OCR) | `apps/fairshare` | `/fairshare/` | vite |
| Elevator Anomaly (roguelike) | `apps/htmlroguemobile` | `/elevator/` | static |
| QSendr (QR file sending) | `apps/qrscans` | `/qsendr/` | static + Python |
| Die Trying (zombie horde defence) | `apps/WeMightAsWellDieTrying` | `/dietrying/` | vite |
| Kindered (Jackbox-style party games, PeerJS) | `apps/kindered/web` (+ `shared/`) | `/kindered/` | vite |
| VolumeBoost (Windows tray volume booster, Python) | `apps/VolumeBooster` | `/volumeboost/VolumeBoost.exe` | download |
| Video Sniffer (Chrome extension; helper not shipped) | `apps/video-sniffer-extension` | `/videosniffer/video-sniffer.zip` | download |

A `download` card opens a checklist (`confirm` in `apps.json`) before the file. `"tag": "WIP"` puts a yellow sticker on
any card. VolumeBoost's exe is committed (`.gitignore` re-includes its `dist/`): rebuild it with PyInstaller from
`VolumeBoost.spec`, then commit the new exe.

Die Trying has its own, longer `AGENTS.md` in its folder. Read it before touching the game.

## Rules the owner has set (follow them exactly)

1. **Never commit or push on your own.** Finish the change, then ask "Commit and push?" and wait. Only commit when told
   to ("commit", "commit and push"). Pushing to `main` deploys to the live site.
2. **Git identity stays `omnichips <331116227+omnichips@users.noreply.github.com>`.** Vercel Hobby blocks deploys whose
   commit author is not the owner. Do not change it. Commit messages are short, in the style of `git log`.
3. **After a push, verify the deploy went live** (fetch the live page/JS and grep for a string new in the change). Vercel
   sometimes fails with a GitHub "secondary rate limit" 403 when pushes come close together. Nothing is wrong with the
   code then: wait ~10 minutes and redeploy (dashboard "Redeploy", or an empty commit with the owner's OK). Prefer few,
   batched pushes. No Vercel connector is available outside Claude; use `curl`.
4. **Test only the app in scope.** QSendr work: `py test_qsendr.py` in `apps/qrscans`, plus
   `npx playwright test --project=real -g QSendr` at the root. Do not run other apps' tests unless shared hub code
   (`scripts/build.mjs`, `apps.json`) changed.
5. **FairsHare: skip the receipt-reading (Tesseract OCR) e2e tests** (`npm run test:e2e:ocr`). Run them only when
   `src/receipt/`, the receipt parts of `src/screens/ExpenseSheet.tsx`, OCR settings in `vite.config.ts`, or the
   `tesseract.js` / `@tesseract.js-data/*` versions change. Run unit + normal e2e once before pushing, not repeatedly.
6. **Leave long testing to the owner.** No multi-minute sims, sweeps or repeated full suites. Make the change, run a quick
   check (type check, one short unit test), and give the exact command for the rest.
7. Vercel is case-sensitive, Windows is not: asset file names must match the code's paths exactly.

## Environment (Windows 11)

- Shells: PowerShell and Git Bash. **Python is not on PATH as `python`**; QSendr uses `py`. For scripted file edits use
  `node -e` / `node - <<'E'`. A Bash heredoc containing an apostrophe fails; use a quoted delimiter.
- Many source files are CRLF. "LF will be replaced by CRLF" git warnings are harmless. Prefer exact-string edits over
  regex patches for code containing escapes.
- Git Bash `date` ignores `TZ=Asia/Manila`; get Philippine time with
  `node -e "console.log(new Date().toLocaleString('sv-SE',{timeZone:'Asia/Manila'}).slice(0,16))"`.
- The owner tests on a real phone from the live site (iPhone Safari), so a push is how changes get tested.

## Commands (repo root)

```
npm run build      build every app into dist/ and generate the home screen
npm run serve      preview at http://localhost:4180 (dist)
npm test           registry and build checks (quick)
npm run test:e2e   built site in WebKit at phone size (needs each app's own npm install)
```

Per app: `apps/fairshare` has `npm test` (vitest), `npm run test:e2e`, `npm run test:e2e:ocr`; `apps/WeMightAsWellDieTrying`
has `npm run dev`, `npm run build` (type check + build), `npm test`.

## Working-tree notes (as of 2026-10-19)

- `.impeccable/config.json` is modified and `apps/WeMightAsWellDieTrying/src/sounds/new music stuff/` is untracked. Both
  are the owner's, not part of any task: leave them out of commits unless told.
- `*.jfif` is gitignored; `apps/WeMightAsWellDieTrying/src/art/wmawdt.jfif` must never be committed.

## The other apps, briefly

- **FairsHare** (`apps/fairshare`): React + Dexie + Tesseract, installable PWA. Its own `DECISIONS.md` logs choices the
  plan left open (read it before changing behaviour) and `PLAN.md` is the original spec. Tests: `npm test` (vitest) and
  `npm run test:e2e` in its folder; OCR tests are opt-in (rule 5).
- **Elevator Anomaly** (`apps/htmlroguemobile`): static HTML/JS roguelike, no build step, service worker in `sw.js`.
  Browser checks live in `e2e/elevator.spec.js` at the root. Asset file names are case-sensitive on Vercel (rule 7).
- **QSendr** (`apps/qrscans`): static web app (`app.js`, `ui.js`, PeerJS in `peerjs.min.js`) plus a Python desktop
  version (`qsendr.py`, `sync_ui.py`, `build_exe.py`). `PLAN.md` has the design, `THIRD_PARTY.md` the licences.
  Tests: `py test_qsendr.py`, and `e2e/` (Playwright, `server.py` serves it) — run them as in rule 4.
