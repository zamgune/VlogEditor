@echo off
cd /d "%~dp0"
if not exist node_modules\electron\dist\electron.exe (
  echo Please run npm ci and npm run setup:ffmpeg first.
  pause
  exit /b 1
)
call npm run start
if errorlevel 1 pause
