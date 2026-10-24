# Installation & Setup Guide

This guide covers all ways to install, configure, and run **Papercell**:

1. **[Option 1: Local Native Execution (`run-local.bat` / `run-local.sh`)](#option-1-local-native-execution-recommended-for-local-ai-agents--python)** — Best when you want to use **Local CLI Agents** (`Claude Code`, `Codex`, `Antigravity`) and **Local Host Python** without paying for separate API keys.
2. **[Option 2: Docker Deployment (`docker compose`)](#option-2-docker-deployment-recommended-for-isolated--server-hosting)** — Best for zero-dependency containerized setup using **Cloud API Keys**.
3. **[Option 3: Development Workflow](#option-3-development-workflow-hot-reload)** — For contributing to or customizing the codebase.

---

## Comparison: Local Native vs. Docker

| Capability | Local Native (`run-local.bat` / `.sh`) | Docker (`docker compose`) |
|---|---|---|
| **Default URL & Port** | `http://localhost:8780` | `http://localhost:8765` |
| **Local CLI Agents (`claude`, `codex`, `agy`)** | **Supported** (uses your signed-in host CLI accounts) | **Not available** (container cannot access host CLIs) |
| **Cloud AI API Keys (Anthropic, OpenAI, Gemini, etc.)** | **Supported** | **Supported** |
| **Python Scenario Precomputation** | **Fast Local Python** (`pandas`/`numpy`) + Pyodide fallback | **Browser Pyodide only** (WebAssembly) |
| **Host Requirements** | Node.js 22+ (and optional Python 3 / CLI agents) | Docker & Docker Compose only |
| **Environment Isolation** | Runs as a local user process | Fully isolated Alpine Linux container |

---

## Option 1: Local Native Execution (Recommended for Local AI Agents & Python)

Running natively on your machine allows the Hono backend to detect CLI agents (`claude`, `codex`, `agy`) and Python (`python` + `pandas`) installed on your operating system.

### Prerequisites
- **Node.js 22+** and **npm** ([nodejs.org](https://nodejs.org/))
- *(Optional, for Local AI Agent mode)* At least one supported CLI agent installed and signed in on your machine:
  - **Claude Code** (`claude`)
  - **OpenAI Codex CLI** (`codex`)
  - **Antigravity CLI** (`agy`)
- *(Optional, for fast local Python grid precomputation)* **Python 3.9+** with `pandas` installed (`pip install pandas numpy`). If not installed, Papercell automatically falls back to in-browser **Pyodide**.

### Steps (Windows)
Double-click **`run-local.bat`** in the repository root, or run from PowerShell / Command Prompt:

```powershell
.\run-local.bat
```

### Steps (macOS / Linux)
```bash
chmod +x run-local.sh
./run-local.sh
```

What the script does:
1. Checks that Node.js is installed.
2. Runs `npm install` inside `app/` on first launch (if `app/node_modules` is missing).
3. Runs `npm run build` (`tsc -b`, `vite build`, `npm run build:viewer`, and `node scripts/server.mjs`).
4. Starts the production server on **`http://localhost:8780`** (or a custom `PORT` if set in your environment).

---

## Option 2: Docker Deployment (Recommended for Isolated / Server Hosting)

Docker builds the entire frontend, single-file viewer, and Hono server inside a multi-stage `node:22-alpine` image.

> **Important Note**: Because Docker containers are isolated from the host OS, **Local CLI Agents (`claude`, `codex`, `agy`) and Local Host Python are not accessible inside Docker**. In Docker mode, use **API Key** mode in the AI Assistant and **Pyodide** (in-browser WebAssembly) for Python verification/precomputation.

### Steps

1. *(Optional)* Copy `.env.example` to `.env` to customize the exposed port (default is `8765`) or pre-configure provider API keys:
   ```bash
   cp .env.example .env
   ```
2. Build and start the container in the background:
   ```bash
   docker compose up -d --build
   ```
3. Open **`http://localhost:8765`** in your browser.

### Pre-configuring Cloud API Keys in Docker
You can either enter your API key directly in the browser UI (**AI Assistant → Settings → API key**) or pass environment variables in `docker-compose.yml` / `.env` so all users of the instance can use AI without entering keys manually:

```yaml
environment:
  - NODE_ENV=production
  - PORT=8787
  - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
  - OPENAI_API_KEY=${OPENAI_API_KEY:-}
  - GOOGLE_GENERATIVE_AI_API_KEY=${GOOGLE_GENERATIVE_AI_API_KEY:-}
  - AI_GATEWAY_API_KEY=${AI_GATEWAY_API_KEY:-}
  - COMPATIBLE_API_KEY=${COMPATIBLE_API_KEY:-}
```

### Stopping the Container
```bash
docker compose down
```

---

## Option 3: Development Workflow (Hot Reload)

For active development, run the Vite dev server and the Hono API server side by side:

```bash
cd app
npm install

# Terminal 1: Start the API & Local Agent server on http://localhost:8787 (auto-restarts on changes)
npm run dev:server

# Terminal 2: Start the Vite frontend dev server on http://localhost:5173 (proxies /api to :8787)
npm run dev
```

Open **`http://localhost:5173`** during development.

### Production Build & Verification Commands
Before deploying or exporting single-file HTML documents (`viewer.html`), run the full build pipeline in `app/`:

```bash
cd app
npx tsc -b              # TypeScript type-checking
npx vite build          # Build main editor bundle into app/dist/
npm run build:viewer    # Build and inline single-file HTML viewer into app/dist/viewer.html
node scripts/server.mjs # Bundle Hono server into app/server-dist/index.mjs
```

Or run all four steps at once:

```bash
cd app
npm run build
```

### Running Unit Tests
```bash
cd app
npx tsx --test src/ai/chat-history.test.ts src/components/ui/equation-visual.test.ts server/ai/editor-agent.test.ts src/ai/request-config.test.ts
```

---

## Security & Network Access Notes

- **Loopback-only restriction (`127.0.0.1`)**: By default, local agent routes (`/api/agents/*`), local Python routes (`/api/python/*`), and local-agent branches of `/api/ai/command` and `/api/ai/copilot` only accept requests originating from `127.0.0.1` / `::1`.
- **Enabling LAN access for local agents (use with caution)**: If you intentionally access your workstation from another device on a trusted private network and want local agents enabled, set `PAPERCELL_ALLOW_REMOTE_AGENTS=1` before starting the server.
- **Read-only workspace sandbox**: When a local CLI agent (`claude`, `codex`, `agy`) is invoked, Papercell creates a temporary directory containing a snapshot of `document.md` and any pasted/attached reference files under `./attachments/`, running the CLI in read-only/plan mode.
