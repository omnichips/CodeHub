# QSendr plan

The laptop runs a small Python server (stdlib `http.server` + `segno` for QR codes). Phones scan a QR code and use
plain web pages from it. The hub page (`index.html`, at `/qsendr/`) is only a guide and download page: a static HTTPS
site cannot run the server, and browsers block an HTTPS page from calling `http://<laptop ip>`.

`qsendr.py` stays one file (pages are strings inside it) so the hub can offer it as a single download until the exe exists.
Check: `py test_qsendr.py`.

| Phase | What | Gate | Status |
|---|---|---|---|
| 1 | Serve one file, QR in the terminal | 25 MB file reaches a phone over a hotspot with data off | built; phone gate not yet run |
| 2 | Control page, native file picker, several files, folder as zip, expiry, "Send to" | Three files shared and all scanned | built; phone gate not yet run |
| 3 | Room mode: phones send too, Received list, device labels, approve prompt, storage and cleanup, text sharing, PIN, auto-delete | iPhone sends 25 MB, Android downloads it, and the reverse | built; phone gate not yet run |
| 4 | Progress, resume (Range), Unicode names, IP picker, firewall help, self-test, notifications, Wi-Fi QR, previews, PWA, drag and drop | Full test matrix | built; phone matrix not yet run |
| 5 | PyInstaller exe with logo, tray icon, download page with checksum | Exe runs on a laptop with no Python | built; passed here with Python removed from its environment, real other laptop not yet tried |

Security must-haves for v1: control page secret (done: `/c/<secret>/`, and only from 127.0.0.1); lock after 5 wrong
PINs (done); warn on risky received files like .exe/.bat/.msi and never open them (done, plus the Windows
"from the internet" mark); Stop button and
10-minute idle timeout (done). Strongly recommended: connected devices list with remove (done), activity log (done, memory only),
public-network warning (done, in "Phone can't connect?" and the header badge), clean-up on exit (done; a force-closed run is cleaned at the next start).

Room test rows: iPhone to Android, Android to iPhone, two phones sending at once, a phone joining mid-transfer,
screen lock during upload, room expiring while a file is still downloading (a download in progress keeps going).

Phase 3 decisions: phones get an HttpOnly cookie scoped to `/r/<token>/` when they join; "ask before a phone joins"
is on by default, the PIN off. What phones send is kept in `Downloads\QSendr` by default (toggle: a temp folder
deleted when the room closes). QSendr only ever deletes files inside its own temp room folder. Upload names go
through `safe_name`. Deferred: resuming a broken upload (phase 4), per-file auto-delete (room-wide only for now),
vibrate/chime on finish (off by default per the plan; not built).

Phase 4 decisions: downloads honour `Range` (browsers resume; only a download that reaches the last byte counts for
auto-delete). Uploads carry an id, total and offset; a cut upload stays as a `.part` in the room's temp folder and the
phone page asks how much arrived and sends the rest (an upload with no data for `UPLOAD_STALL` seconds is paused).
Network help comes from one PowerShell query (addresses, network category, firewall rules for this Python), run in
the background; `assess()` turns it into findings. Notifications use the browser's Notification API on the control
page (Windows shows them as normal toasts). Previews serve the original image (no resizing without a dependency).
One QR per address became an Address picker that swaps the QR. Skipped: file fingerprints (phones can't hash on plain
HTTP; belongs with Secure mode), Add to Home Screen (each room has a new address, and HTTP pages aren't installable).

Phase 5 decisions: `py build_exe.py` builds a one-file windowed `QSendr.exe` (PyInstaller, icon from `logo.png`, the
chip cut out of `chips logo.png`) and writes its size and SHA-256 into `index.html`, so the hub page and the file can't
disagree (the hub e2e test checks it). The exe lives in this folder and deploys with the hub. Tray via pystray; the tray
replaces the console and shows Windows notifications. Start with Windows = HKCU Run key with `--background` (room
closed). "Send to" is a .lnk made through PowerShell. Not done: code signing (paid; SmartScreen warns once), update check.

Distribution (decided when first pushed): the exe is NOT committed or deployed. `py build_exe.py` writes it to
`apps/qrscans/dist/QSendr.exe` (dist/ is git-ignored and skipped by the hub build) and updates the fingerprint on the
guide page. Attach the exe to a GitHub Release at github.com/omnichips/CodeHub/releases (the page links there);
push the page after each build so its fingerprint matches the release. The guide page is an installable PWA
(manifest, icons, service worker, like Elevator Anomaly); the exe is separate from that install.
