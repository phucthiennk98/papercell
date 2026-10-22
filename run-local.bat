@echo off
chcp 65001 >nul
REM Run Papercell directly on this machine so it can use installed agents (Claude Code, Codex, Antigravity).
cd /d "%~dp0app"
where node >nul 2>nul || (echo Node.js is not installed. Get it at https://nodejs.org, then run this again. & pause & exit /b 1)
if not exist node_modules (
  echo Installing dependencies for the first time, this takes a few minutes...
  call npm install || (pause & exit /b 1)
)
echo Building...
call npm run build || (pause & exit /b 1)
set PORT=8780
set NODE_ENV=production
echo.
echo Papercell is running at http://localhost:8780  (close this window to stop)
start "" http://localhost:8780
node server-dist/index.mjs
