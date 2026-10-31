# Registers the Video Sniffer helper with Chrome for the current Windows user. No admin rights needed.
# It writes three files next to this script (config.json, vsniff-helper.bat, com.videosniffer.helper.json)
# and one registry key: HKCU\Software\Google\Chrome\NativeMessagingHosts\com.videosniffer.helper
# Read it before running it. Undo with: Remove-Item 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.videosniffer.helper'
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
  [Parameter(Mandatory)][string]$ToolsDir,
  [Parameter(Mandatory)][string]$DownloadDir
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

foreach ($exe in 'yt-dlp.exe', 'ffmpeg.exe') {
  if (-not (Test-Path (Join-Path $ToolsDir $exe))) { throw "$exe not found in $ToolsDir" }
}
$node = (Get-Command node).Source
New-Item -ItemType Directory -Force $DownloadDir | Out-Null

# WriteAllText writes UTF-8 without a BOM, which Chrome's manifest parser needs.
$config = @{ tools = (Resolve-Path $ToolsDir).Path; downloads = (Resolve-Path $DownloadDir).Path } | ConvertTo-Json
[IO.File]::WriteAllText("$here\config.json", $config)
[IO.File]::WriteAllText("$here\vsniff-helper.bat", "@echo off`r`n`"$node`" `"%~dp0vsniff-helper.js`" %*`r`n")

$manifest = [ordered]@{
  name = 'com.videosniffer.helper'
  description = 'Video Sniffer yt-dlp helper'
  path = "$here\vsniff-helper.bat"
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json
[IO.File]::WriteAllText("$here\com.videosniffer.helper.json", $manifest)

New-Item -Force -Path 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.videosniffer.helper' -Value "$here\com.videosniffer.helper.json" | Out-Null

Write-Host "Helper registered for extension $ExtensionId"
Write-Host "yt-dlp: $(& (Join-Path $ToolsDir 'yt-dlp.exe') --version)"
Write-Host "Downloads go to: $DownloadDir"
Write-Host 'Reload the extension in chrome://extensions, then press Scan.'
