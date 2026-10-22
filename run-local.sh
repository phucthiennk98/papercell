#!/usr/bin/env sh
# Run Papercell directly on this machine (macOS/Linux) so it can use installed agents.
set -e
cd "$(dirname "$0")/app"
command -v node >/dev/null || { echo "Node.js is not installed: https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install
npm run build
echo "Papercell is running at http://localhost:8780 (Ctrl+C to stop)"
PORT=8780 NODE_ENV=production node server-dist/index.mjs
