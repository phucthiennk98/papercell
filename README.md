# Papercell

A Lark Docs-style editor for scientific articles. Article figures are drawn with JS, include parameter sliders, and come with the original Python code for comparison and verification. The AI assistant can use an API key or an agent installed on your machine.

Detailed design: [docs/DESIGN.md](docs/DESIGN.md).

## Running the app

### 1. Docker: the easiest option, with AI via an API key

```bash
docker compose up -d --build
```

Open http://localhost:8765. To change the port, copy `.env.example` to `.env` and edit `PORT`.

To provide keys on the server so you do not need to enter them in the app, add environment variables to `docker-compose.yml`, such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_GATEWAY_API_KEY`.

### 2. Run directly on your machine: use installed agents (Claude Code, Codex, Antigravity)

Windows: double-click **`run-local.bat`**. macOS/Linux: run `./run-local.sh`. The script installs dependencies automatically (on the first run), builds the app, then opens http://localhost:8780. Under **AI Assistant → Local agent**, the app detects agents on your machine and uses the account already signed in to that agent. The agent runs in read-only mode in a temporary directory containing the article.

This mode does not work in Docker because the container cannot see programs installed on the host. For safety, the server only allows agent calls from the same machine (127.0.0.1).

## Development

```bash
cd app
npm install
npm run dev:server   # API server on port 8787 (rebuilds automatically on changes)
npm run dev          # UI on port 5173
```

## Structure

| Directory | Contents |
|---|---|
| `app/src/components/` | Plate editor UI components (imported via shadcn and customized) |
| `app/src/figure/` | JS figure cards: rendering, popup, code access, Python ↔ JS verification, data |
| `app/src/ai/` | AI Assistant sidebar and provider settings |
| `app/src/docs/` | Storage for multiple articles in the browser |
| `app/server/` | Hono server: AI routes, local agents, UI serving |

## License

MIT
