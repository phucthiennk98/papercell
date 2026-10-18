#!/usr/bin/env sh
# Chạy Papercell thẳng trên máy (macOS/Linux) để dùng được agent đã cài.
set -e
cd "$(dirname "$0")/app"
command -v node >/dev/null || { echo "Chưa cài Node.js: https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install
npm run build
echo "Papercell đang chạy tại http://localhost:8780 (Ctrl+C để dừng)"
PORT=8780 NODE_ENV=production node server-dist/index.mjs
