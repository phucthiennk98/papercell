@echo off
chcp 65001 >nul
REM Chạy Papercell thẳng trên máy để dùng được agent đã cài (Claude Code, Codex, Antigravity).
cd /d "%~dp0app"
where node >nul 2>nul || (echo Chưa cài Node.js. Tải tại https://nodejs.org rồi chạy lại. & pause & exit /b 1)
if not exist node_modules (
  echo Đang cài thư viện lần đầu, mất vài phút...
  call npm install || (pause & exit /b 1)
)
echo Đang build...
call npm run build || (pause & exit /b 1)
set PORT=8780
set NODE_ENV=production
echo.
echo Papercell đang chạy tại http://localhost:8780  (đóng cửa sổ này để dừng)
start "" http://localhost:8780
node server-dist/index.mjs
