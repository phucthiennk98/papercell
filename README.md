# Papercell

A Lark-Docs-style editor for scientific papers. Figures are drawn in JavaScript with parameter sliders, next to the author's original Python code for verification. An AI assistant works through an API key or through agents installed on your computer.

Design notes: [docs/DESIGN.md](docs/DESIGN.md). Codebase map: [docs/CODEBASE.md](docs/CODEBASE.md).

## Running

### 1. Docker — easiest, AI via API key

```bash
docker compose up -d --build
```

Open http://localhost:8765. To change the port, copy `.env.example` to `.env` and edit `PORT`.

To give the server keys so you don't have to type them in the app, add environment variables in `docker-compose.yml`, e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_GATEWAY_API_KEY`.

### 2. Directly on your machine — uses installed agents (Claude Code, Codex, Antigravity)

Windows: double-click **`run-local.bat`**. macOS/Linux: run `./run-local.sh`. The script installs dependencies (first run), builds, then opens http://localhost:8780. Under **AI Assistant → Local agent**, the app detects the agents on your machine and uses the account each one is already signed in to. Agents run read-only in a temporary folder holding the document.

This mode does not work under Docker, because the container cannot see programs installed on the host. For safety, the server only lets agents be called from the same machine (127.0.0.1).

## Development

```bash
cd app
npm install
npm run dev:server   # API server on port 8787 (rebuilds on change)
npm run dev          # UI on port 5173
```

## Layout

| Folder | Contents |
|---|---|
| `app/src/components/` | Plate editor UI (pulled in via shadcn, customized) |
| `app/src/figure/` | JS figure cards: drawing, dialog, code visibility, Python ↔ JS verification, data |
| `app/src/ai/` | AI Assistant sidebar and provider settings |
| `app/src/docs/` | Multiple documents stored in the browser |
| `app/server/` | Hono server: AI routes, local agents, static serving |

## License

MIT
