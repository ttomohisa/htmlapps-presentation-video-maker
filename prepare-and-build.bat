@echo off
setlocal
cd /d "%~dp0"
where pwsh >nul 2>nul
if errorlevel 1 (
  echo PowerShell 7 ^(pwsh^) was not found.
  echo Install PowerShell 7, then run this file again.
  exit /b 1
)
echo [1/2] Resolving pinned browser dependencies...
pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ".\scripts\sync-dependency-lock.ps1"
if errorlevel 1 exit /b %errorlevel%
echo [2/2] Building standalone HTML files...
call ".\build-standalone.bat"
exit /b %errorlevel%
