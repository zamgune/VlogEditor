$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$taskRoot = Split-Path -Parent $PSScriptRoot
$archiveDir = Join-Path $taskRoot 'vendor/downloads'
$installDir = Join-Path $taskRoot 'vendor/ffmpeg'
$archive = Join-Path $archiveDir 'ffmpeg-9.0.2-essentials_build.zip'
$expectedHash = '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba'
New-Item -ItemType Directory -Force -Path $archiveDir,$installDir | Out-Null
if (!(Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
  $partialArchive = Join-Path $archiveDir ('ffmpeg-' + [guid]::NewGuid().ToString() + '.partial.zip')
  $downloadUrl = 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip'
  try {
    Write-Host 'Downloading FFmpeg (about 110 MB)...'
    if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
      & curl.exe --fail --location --retry 2 --connect-timeout 20 --max-time 300 --output $partialArchive $downloadUrl
      if ($LASTEXITCODE -ne 0) { throw 'FFmpeg download failed. Check the connection and run again.' }
    } else {
      Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $partialArchive -TimeoutSec 300
    }
    if ((Get-FileHash -LiteralPath $partialArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
      throw 'FFmpeg archive checksum mismatch. Do not run this archive.'
    }
    Move-Item -LiteralPath $partialArchive -Destination $archive -Force
  } finally {
    if (Test-Path -LiteralPath $partialArchive) { Remove-Item -LiteralPath $partialArchive -Force }
  }
}
Write-Host 'Extracting and verifying video tools...'
Expand-Archive -LiteralPath $archive -DestinationPath $installDir -Force
$bin = Join-Path $installDir 'ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe'
$versionOutput = & $bin -version
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg verification failed.' }
$versionOutput | Select-Object -First 1
$probe = Join-Path $installDir 'ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe'
$probeVersionOutput = & $probe -version
if ($LASTEXITCODE -ne 0) { throw 'FFprobe verification failed.' }
$probeVersionOutput | Select-Object -First 1
