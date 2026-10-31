# Helper setup (Windows)

The helper lets the extension run your own copy of yt-dlp. It needs Node.js (already installed), yt-dlp and ffmpeg.

## 1. Make a tools folder

Use a folder **outside OneDrive**, so OneDrive does not sync or offload the programs:

```powershell
New-Item -ItemType Directory C:\Users\Acer\VideoSnifferTools
cd C:\Users\Acer\VideoSnifferTools
```

## 2. yt-dlp, from the official releases page only

1. Open https://github.com/yt-dlp/yt-dlp/releases/latest
2. Download `yt-dlp.exe` and `SHA2-256SUMS` into the tools folder.
3. Check the checksum. The two lines printed must show the same hash (ignore upper/lower case):

```powershell
(Get-FileHash .\yt-dlp.exe -Algorithm SHA256).Hash
Get-Content .\SHA2-256SUMS | Where-Object { $_ -match ' yt-dlp\.exe$' }
```

## 3. ffmpeg

ffmpeg.org does not build Windows files itself; its download page links to gyan.dev, which is fine to use.

1. From https://www.gyan.dev/ffmpeg/builds/ download `ffmpeg-release-essentials.zip` and its `.sha256` file.
2. Check it. The two hashes must match:

```powershell
(Get-FileHash .\ffmpeg-release-essentials.zip -Algorithm SHA256).Hash
Get-Content .\ffmpeg-release-essentials.zip.sha256
```

3. Open the zip, and copy `ffmpeg.exe` and `ffprobe.exe` from its `bin` folder straight into the tools folder.

## 4. Write VERSION.txt

In the tools folder, create `VERSION.txt` with the versions and today's date, for example:

```
yt-dlp 2026.09.01, copied 2026-10-14, checksum OK
ffmpeg 8.0 essentials (gyan.dev), copied 2026-10-14, checksum OK
```

## 5. Register the helper

1. In `chrome://extensions`, turn on Developer mode and copy the **ID** of Video Sniffer (32 letters).
2. Read `install.ps1` first. It writes three files in this `helper` folder and one registry key under your user account (`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.videosniffer.helper`). That key tells Chrome that only your extension may start the helper.
3. Run it, putting in your ID and the folder where downloads should go:

```powershell
cd C:\Users\Acer\OneDrive\Documents\VSCode\video-sniffer-extension\helper
powershell -ExecutionPolicy Bypass -File .\install.ps1 -ExtensionId <your-id> -ToolsDir C:\Users\Acer\VideoSnifferTools -DownloadDir "C:\Users\Acer\Videos\Video Sniffer"
```

4. Press reload on Video Sniffer in `chrome://extensions`. Open the popup. The top line should read `yt-dlp <version> · N days old`.

If the extension ID changes (for example after loading the folder from a new place), run step 5 again with the new ID.

## Messages you might see

| Popup says | Meaning |
| --- | --- |
| Install yt-dlp for better results | The registry key is missing. Run step 5. |
| Helper problem: Access to the specified native messaging host is forbidden | The ID given to `install.ps1` is not this extension's ID. Run step 5 again. |
| Helper problem: Error when communicating with the native messaging host | The helper crashed. Check that `node` runs in a new terminal, and that `config.json` points at the right folders. |
| Could not start yt-dlp | `yt-dlp.exe` is not in the tools folder. |

## "Use my browser login"

The switch is in the popup and is off by default. While it is on, the extension reads the cookies for the site you are scanning (for example `instagram.com`) and passes them to the helper. The helper writes them to a private temp file for that one yt-dlp run and deletes the file afterwards. They go only to that site.

This replaces yt-dlp's `--cookies-from-browser chrome`, which no longer works on Windows: Chrome encrypts its cookie file with a key that only Chrome itself can use.

Try it only with your own account, and never share files from your temp folder.

## Refreshing yt-dlp (by hand, monthly)

Do this monthly, or when a public video that plays in your browser fails to download.

1. Rename the current `yt-dlp.exe` to `yt-dlp.old.exe` and keep it for one round, in case you need to go back.
2. Repeat step 2 with the new release, and update `VERSION.txt`.

The helper never downloads updates by itself.

## Removing it

```powershell
Remove-Item 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.videosniffer.helper'
```
