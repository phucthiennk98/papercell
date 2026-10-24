# Papercell

**Papercell** is an interactive, Lark Docs-style scientific article editor where figures, mathematical formulas, datasets, and AI agents work together in a single workspace.

Figures are rendered live in JavaScript (**Observable Plot**, **D3**, **MapLibre GL**) with interactive reader controls (sliders, dropdowns, radio buttons, switches), paired side-by-side with the author's **original Python code** for numerical verification and grid precomputation. Completed articles export into a **single, self-contained HTML file** that opens and runs interactively anywhere—even offline via `file://`.

- **Installation & Setup Guide**: [**INSTALL.md**](INSTALL.md)
- **Design Philosophy**: [**docs/DESIGN.md**](docs/DESIGN.md)
- **Codebase Architecture Map**: [**docs/CODEBASE.md**](docs/CODEBASE.md)

---

## Key Features

### 1. Interactive Figures with Dual JS + Python Architecture
- **No-Code Design Tab (`DesignTab`)**: Build 12 chart and map types directly from attached datasets (`.csv`, `.tsv`, `.xlsx`, `.json`, `.geojson`) without writing code:
  - *Charts*: Bar, Horizontal Bar, Line, Area, Scatter, Histogram, Boxplot, Heatmap, Typed Table.
  - *Maps*: Point Map, Heatmap Map, Choropleth Region Map (powered by MapLibre GL).
- **Live Code Editor (`CodeEditor`)**: Full CodeMirror 6 editor for both **JavaScript** (Observable Plot / D3) and **Original Python** (`pandas` / `numpy`) with context-aware autocomplete for datasets, columns, parameters, and `@dataset.column` mentions.
- **Interactive Reader Controls**: Add sliders (`range`), dropdowns (`select`), radio buttons (`radio`), and switches (`toggle`) that readers can manipulate in real time, both in the editor and in exported HTML files.
- **Python ↔ JS Verification & Scenario Precomputation**:
  - **Verify**: Compare the output exposed by JavaScript (`expose(value)`) against the original Python script's `ket_qua` variable within floating-point tolerance (`1e-9 + 1e-6 * |x|`).
  - **Precompute Grid (`ScenarioTab`)**: Precompute thousands of parameter combinations using local Python (or in-browser Pyodide WebAssembly) and pack the results into a compressed base64/gzip cache so complex models respond instantaneously to slider drags.

### 2. Visual Interactive Formula Editor (`EquationDialog` & `Formula` Toolbar)
- **Direct Click-to-Edit on Rendered Math**: Click any number, variable, Greek symbol, superscript, or denominator directly on a rendered KaTeX formula to open the spacious **Formula Editor Dialog**—never covering the equation cell in the document.
- **Direct Part Manipulation**:
  - Edit numbers with one-click steppers (`-1`, `-0.1`, `+0.1`, `+1`) or `Up`/`Down` arrow keys.
  - **Sync All Matching Symbols**: Toggle *"Sync all N occurrences"* (e.g., update every $\mu$ or $\sigma$ across an equation simultaneously).
  - **One-Click Structure Conversion**: Wrap the selected term into a fraction (`a/b`), power (`xⁿ`), subscript (`xᵢ`), square root (`√x`), or parentheses (`(x)`).
  - **Formula Parts Strip**: Clickable token pills in reading order so even deeply nested subscripts and exponents are effortless to select.
- **12 Pre-Built Scientific Formula Templates**: Instant templates for Probability & Statistics (Exponential PDF, Normal PDF, Bayes' Theorem, Mean & Variance), Calculus & Analysis (Piecewise Cases, Definite Integral, Taylor Series, Inverse-Square Law), and Modeling & Metrics (Linear Regression, Ridge/OLS Loss, Softmax, Logistic Sigmoid, Shannon Entropy, Cosine Similarity).
- **Live Bidirectional LaTeX Sync**: Visual changes and raw LaTeX edits stay synchronized in real time.

### 3. Dual-Mode AI Assistant & Non-Blocking In-Cell AI
- **Use Local CLI Agents or Cloud API Keys**:
  - **Local Agent Mode (Zero API Key Cost)**: Automatically detects **Claude Code (`claude`)**, **OpenAI Codex (`codex`)**, and **Antigravity (`agy`)** installed on your computer, reusing your existing CLI login session with selectable model and reasoning effort.
  - **Cloud API Mode**: Supports Anthropic Claude, OpenAI, Google Gemini, Vercel AI Gateway, and any OpenAI-Compatible endpoint.
- **Non-Blocking In-Cell AI Execution**:
  - Trigger AI from any block's hover toolbar (`✨`), the `/` menu, or the top `Figure` and `Formula` toolbar dropdowns.
  - While AI generates or edits a block, **only that target cell shimmers** (`.ai-cell-active`) with an elapsed timer and `Stop` button—you can freely scroll and edit any other part of the document without cursor hijacking.
  - Preserves multi-column (`column_group`) layouts when editing side-by-side figures or text blocks.
- **Clipboard Image Paste (`Ctrl+V`) & Reference File Import (`📎`)**:
  - Paste screenshots of charts, equations, or tables directly from the clipboard (`Ctrl+V`) or attach reference files (`.png`, `.jpg`, `.webp`, `.svg`, `.csv`, `.tsv`, `.xlsx`, `.json`, `.md`, `.txt`, `.py`, `.tex`) in both the right-hand **AI Assistant** and the **in-cell AI menu**.
  - Local CLI agents receive attached images and files directly inside `./attachments/` in their session workspace; Cloud APIs receive multimodal image parts and structured `<reference_file>` context.
- **Live Interactive Previews & Per-Document Chat History**:
  - Charts generated in the **AI Assistant** sidebar render as live, interactive `FigureCard` previews inside the chat bubble before you click **Insert into article**.
  - Each document maintains its own **Saved Conversations (`History`)** list so you can switch between past threads, start a new conversation (`+`), or delete old threads (`🗑️`).

### 4. Lark-Style Scientific Document Editor & Single-File HTML Export
- **Multi-Column Drag & Drop**: Drag any block to the left or right edge of another block to create up to 4 resizable side-by-side columns.
- **Unified Hover Action Bar**: Every text block, formula block, figure card, and multi-column container displays a clean floating toolbar on hover.
- **Single-File HTML Export**: Click **Export** to package the article, embedded datasets, precomputed Python grids, interactive charts, and KaTeX fonts into one compressed `.html` file (`~3.5 MB`) that opens in any browser with zero external server requirements.

---

## Local Native vs. Docker: Pros & Cons

Papercell can be run either **natively on your host OS** (`run-local.bat` / `run-local.sh`) or inside a **Docker container** (`docker compose up -d --build`). Choose the mode that fits your workflow:

### 1. Local Native Execution (`run-local.bat` / `run-local.sh` — Port `8780`)

#### Pros
- **Uses Installed Local CLI Agents (`Claude Code`, `Codex`, `Antigravity`)**: Directly invokes the CLI agents already installed and authenticated on your computer—no separate API keys or per-token billing setup required.
- **Persistent Multi-Turn CLI Agent Sessions**: Keeps a live background CLI session (`app-server` / `stream-json`) per conversation so the local agent remembers context across turns and can inspect pasted images/files in `./attachments/`.
- **Fast Native Python Precomputation**: Uses your machine's native Python + `pandas`/`numpy` for rapid scenario grid precomputation across thousands of parameter combinations.

#### Cons
- **Requires Node.js 22+ on the Host**: You need Node.js installed locally (and Python/`pandas` if you want native Python speed instead of Pyodide).
- **Localhost Security Restriction**: For safety, local agent and local Python endpoints only accept connections from `127.0.0.1` unless explicitly overridden with `PAPERCELL_ALLOW_REMOTE_AGENTS=1`.

---

### 2. Docker Deployment (`docker compose` — Port `8765`)

#### Pros
- **Zero Host Dependencies**: No need to install Node.js, npm packages, or build tools on the host machine—everything compiles and runs inside an isolated `node:22-alpine` container.
- **Ideal for Shared / Team Servers**: Easy to deploy on a lab server or VPS with pre-configured Cloud API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`) in `.env`.
- **Clean & Reproducible**: Consistent environment across Windows, macOS, and Linux hosts.

#### Cons
- **Cannot Use Host CLI Agents (`claude`, `codex`, `agy`)**: Because the Docker container is isolated from the host operating system, it cannot detect or spawn CLI binaries or read credentials installed on your host machine. You must use **Cloud API Key** mode in Docker.
- **No Native Host Python**: Scenario precomputation and verification run inside the browser via **Pyodide (WebAssembly)** rather than native host Python.

---

## Quick Start

See [**INSTALL.md**](INSTALL.md) for full step-by-step instructions, environment variables, and troubleshooting.

- **Local Native (Windows)**: Double-click **`run-local.bat`** → opens `http://localhost:8780`
- **Local Native (macOS / Linux)**: Run `./run-local.sh` → opens `http://localhost:8780`
- **Docker**: Run `docker compose up -d --build` → opens `http://localhost:8765`

---

## Project Structure

| Path | Description |
|---|---|
| [`app/src/figure/`](app/src/figure/) | Figure cards, Observable Plot / D3 / MapLibre runtime, Design tab (`builder.ts`, `DesignTab.tsx`), popup (`FigureDialog.tsx`), CodeMirror (`CodeEditor.tsx`), Python verification & scenario precomputation |
| [`app/src/components/ui/`](app/src/components/ui/) | Customized Plate editor components, interactive visual formula editor (`equation-node.tsx`, `equation-visual.ts`), in-cell AI menu (`ai-menu.tsx`), toolbars (`figure-toolbar-button.tsx`, `equation-toolbar-button.tsx`) |
| [`app/src/ai/`](app/src/ai/) | AI Assistant panel (`AssistantPanel.tsx`), non-blocking cell AI task store (`ai-task-store.ts`), per-document chat history & attachments (`chat-history.ts`), figure/formula node parser (`figure-nodes.ts`), and domain skills (`skills/*.md`) |
| [`app/src/editor/`](app/src/editor/) | Document schema (`types.ts`), legacy document upgrader (`upgrade.ts`), automatic numbering (`scan.ts`), side-by-side column drag-and-drop (`side-drop.ts`) |
| [`app/src/viewer/`](app/src/viewer/) | Standalone reading page bundled into `dist/viewer.html` for single-file HTML exports |
| [`app/server/`](app/server/) | Hono server: Cloud AI streaming, local CLI agent drivers & persistent sessions (`server/agents/`), local Python runner (`server/python/`) |
| [`docs/`](docs/) | Architecture map ([`docs/CODEBASE.md`](docs/CODEBASE.md)) and design notes ([`docs/DESIGN.md`](docs/DESIGN.md)) |

---

## License

MIT
