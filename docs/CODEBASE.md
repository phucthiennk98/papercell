# Papercell codebase map

Documentation for agents (and people) who need to understand the project before editing code. All paths are relative to the project root.
Merged from two code review reports (Antigravity: server, AI, app shell, build; Codex: figures and editor)
and spot-checked against the code by Claude on 2026-10-21. **Update this file when changing the architecture.**

Contents
- Part A. App shell, server, AI, Plate customization, build
- Part B. Figure cards, Design, Python precomputation, HTML export, editor
- Part C. Known unresolved risks

---

## Part A. App shell, server, AI, Plate customization, build

### 1. App shell and document storage

- **Entry point (`app/src/main.tsx`)**: Loads KaTeX CSS (`katex.min.css`), Tailwind (`index.css`), and figure CSS (`figure/papercell.css`, `figure/figure.css`), then renders `<App />`.
- **Main shell (`app/src/App.tsx`)**:
  - Manages application-level state: current `docId` (initialized via `ensureFirstDoc()`), the `docs` list (`listDocs()`), left sidebar visibility (`sidebar`), article search query (`query`), table of contents (`headings`), the `editor` reference, and whether `AssistantPanel` is open (stored in `localStorage['papercell.assistant']`; automatically collapses `sidebar` when the screen is `< 1280px`).
  - **Left sidebar**: Article search by title, pinned documents section (`Pinned` with `togglePinDoc()`), document list (create a blank article with `emptyDoc()`, pin/unpin on hover, delete with confirmation via `AlertDialog` and `deleteDoc()`), table-of-contents tree (`Outline` jumps to blocks via `editor.api.toDOMNode`), and 2 buttons to quickly create sample articles (`makeSample()`, `makeGallery()`).
  - **`DocView`**: Initializes the editor with `usePlateEditor({ plugins: PapercellKit, value: initial.content })` (assigns `window.__editor = editor` in dev). Autosaves after 400ms (`persist`) when `meta`, `files`, or article content (`onChange`) changes. Synchronizes reading/editing mode (`readOnly`) with `location.hash` (`#read` / `#edit`).
  - **Three React Contexts wrap `<Plate>`**:
    1. `MetaContext` (`app/src/editor/DocHeader.tsx`): provides `{ meta, setMeta }` (title, authors, date) to `DocHeader` and the export button.
    2. `DataContext` (`app/src/figure/runtime.ts`): provides `{ files, data: parseData(files), setFiles }` to figure cards, the data panel (`DataPanel`), and code suggestions.
    3. `FigureNumbers` (`app/src/figure/FigureElement.tsx`): provides a figure number mapping (`scan(value).figs`) for automatic numbering.
  - **Synchronizing AI configuration into Plate**: `useEffect` in `DocView` registers `aiStore.subscribe` to inject `aiMode`, `agent`, `agentModel`, `agentEffort`, and `aiConfig` into `aiChatPlugin`'s `chatOptions.body` and `CopilotPlugin`'s `completeOptions.body`.
- **`localStorage` storage (`app/src/docs/store.ts`)**:
  - The article index is stored under `papercell.index.v1` (`DocEntry[]` containing `{ id, title, updated, pinned? }`), newest first. `saveDoc` preserves `pinned`, and `togglePinDoc(id)` toggles pin state in place.
  - Each article's content is stored separately at `papercell.doc.<id>` (`PapercellDoc` format, `version: 3`). When read via `loadDoc(id)`, data passes through `upgradeDoc(d)` (`app/src/editor/upgrade.ts`) for backward compatibility.
  - `ensureFirstDoc()`: On first opening, automatically creates the chart test gallery (`papercell.gallery.v1`) and sample article (`makeSample()`).
- **Plate plugin kit (`app/src/editor/papercell-kit.tsx`, `app/src/components/editor/editor-kit.tsx`)**:
  - `EditorKit` collects all standard plugins: `CopilotKit`, `AIKit`, text/table/column/math/code blocks (`BasicBlocksKit`, `TableKit`, `ColumnKit`, `MathKit`, `CodeBlockKit`…), drag-and-drop (`DndKit`), the `/` menu (`SlashKit`), import/export (`DocxKit`, `MarkdownKit`), and toolbars (`FixedToolbarKit`, `FloatingToolbarKit`).
  - `PapercellKit = [...EditorKit, FigurePlugin, DocHeaderPlugin]`: adds the void block `FigurePlugin` (`key: 'figure'`, renders `FigureElement`) and `DocHeaderPlugin` (`key: 'docHeader'`, renders `DocHeader` at `beforeEditable`).

### 2. Hono server, AI SDK, local agents, and local Python

- **Main routes (`app/server/index.ts`)**:
  - Runs on Hono (`@hono/node-server`), default port `PORT ?? 8787`. When `NODE_ENV === 'production'`, serves static files from `./dist` with an SPA fallback to `./dist/index.html`.
  - `GET /api/health`: returns `{ ok: true }` (used for the Docker healthcheck).
  - `POST /api/ai/command` (`app/server/ai/command/route.ts`): serves Plate's in-article AI menu (`aiChatPlugin`). Creates a `SlateEditor` with `BaseEditorKit`, automatically selects a tool (`generate`, `edit`, `comment`) or edits selected table cells. API mode uses `streamText` + `createUIMessageStream`; local mode uses the same prompt builders through `editor-agent.ts` and emits Plate UIMessage text/comment/table events.
  - `POST /api/ai/copilot` (`app/server/ai/copilot/route.ts`): sentence completion suggestions (`GhostText`) for `CopilotPlugin`. Returns JSON with a `text` field in both modes; API mode limits output to 50 tokens, local mode requests at most 50 words/300 characters and only returns a continuation ending at punctuation (or the `0` sentinel).
  - `POST /api/assistant/chat` (`app/server/ai/assistant.ts`): serves chat in the right sidebar.
  - `GET /api/ai/status` & `POST /api/ai/models`: report which providers already have environment variables on the server (`serverKeys()`) and fetch model lists directly from provider APIs (`listModels()`).
  - **`isLocal(c)` check**: Only allows addresses `127.0.0.1`, `::1`, `::ffff:127.0.0.1` (or when `PAPERCELL_ALLOW_REMOTE_AGENTS=1` is enabled) to call `/api/agents*`, `/api/python*`, or use local-agent mode on `/api/ai/command` and `/api/ai/copilot`. API-provider mode stays accessible from remote clients.
- **AI configuration & streaming (`app/server/ai/provider.ts`, `app/server/ai/assistant.ts`)**:
  - `readConfig(body)` reads `body.aiConfig` (or Plate's legacy `apiKey` + `model` format). `keyFor(cfg)` prioritizes the user-entered `cfg.apiKey`; if empty, it uses server environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `AI_GATEWAY_API_KEY`, `COMPATIBLE_API_KEY`).
  - `resolveModel(cfg)` creates a Vercel AI SDK `LanguageModel` (`createAnthropic`, `createOpenAI`, `createGoogleGenerativeAI`, `createGateway`, `createOpenAICompatible`). Throws `ConfigError` (HTTP 401) if the key is missing.
  - `assistantChat` truncates the `doc` context to at most `200_000` characters, calls `streamText`, and streams `text/plain`. Progress messages and mid-stream errors are embedded directly in the stream using two markers: `PROGRESS_MARK = '\u0000P:'` (terminated by `\n`) and `ERROR_MARK = '\u0000ERR:'`. The `describe(e)` function translates error codes 401/403, 404, `ECONNREFUSED` into clear English messages.
  - **Shared editor routing (`app/server/ai/editor-agent.ts`)**: `aiMode: 'agent'` selects the installed `agent` and forwards `agentModel`/`agentEffort` as `agentChat` options `{ model, effort }`, ignoring stale API configuration. Missing `aiMode` retains API behavior. Both editor handlers require explicit authorization from the Hono wrapper before starting an agent; agent IDs and CLI model/effort identifiers are validated before execution. There is no API fallback on an agent error.
  - Local editor calls reuse `agentChat`'s read-only temporary document and cancellation path. Responses are buffered (maximum 1,000,000 characters) so split progress markers and errors never become document content. Comment/table JSON, including fenced JSON, is validated atomically against original selected block/cell IDs before any modifications are emitted; malformed/empty updates fail without finished events. Comments spanning nested blocks are split by original block ID because Plate's multi-fragment comment resolver assumes top-level siblings. Local text updates use matching text start/delta/end events, and successful structured updates use matching `streaming`/`finished` events.
- **Local agents (`app/server/agents/local.ts`)**:
  - Supports 3 CLI agents in the `AGENTS` array:
    1. `claude` (Claude Code): `claude -p --output-format text --permission-mode plan` (receives the prompt via `stdin`).
    2. `codex` (Codex): `codex exec --json -s read-only --skip-git-repo-check --ephemeral -` (receives the prompt via `stdin`, filters JSONL to use only the final `agent_message` as the answer, forwards earlier steps to `progress`).
    3. `agy` (Antigravity): `agy -p=<prompt> --output-format stream-json --mode plan` (`promptInArgs: true`, reads `step_update` from the JSON stream).
  - `resolveBin(name)` finds executables in `PATH` and common installation directories `knownDirs(name)` (prefers `.exe` over `.cmd`/`.bat` on Windows). `detectAgents(force)` runs `<bin> --version` and caches results for 60 seconds.
  - `agentChat`: Creates a temporary `papercell-agent-*` directory in `tmpdir()`, writes the article content (up to `500_000` characters) to `document.md`, runs the agent in read-only/plan mode with the temporary directory as `cwd` (5-minute timeout), streams with `PROGRESS_MARK` / `ERROR_MARK`, and removes the temporary directory in `finally`.
  - `stopTree(child)`: On Windows, agents run via `.cmd` create child processes, so `child.kill()` only stops the outer shell; call `taskkill /pid <pid> /T /F` to stop the entire process tree on cancellation or timeout.
- **Local Python (`app/server/python/grid.ts`)**:
  - `pythonBin()` finds `python`, `py`, or `python3` (skips if `bin.shell === true`). `detectPython()` checks that `import sys, pandas` can execute and caches results for 60 seconds.
  - `runGrid(job, signal)`: Creates a temporary `papercell-grid-*` directory, writes data tables to `data_<i>.csv|json` and the `runner.py` script (the `RUNNER` constant), passes `{ code, files, combos }` via `stdin`.
  - The `RUNNER` script preloads data with `pandas`, compiles code once (`compile(job["code"], "<python>", "exec")`), then iterates over parameter combinations `combos`: creates an independent copy of `data` (`v.copy()` / `copy.deepcopy`), executes `exec(code, g)`, collects the `result` variable (falling back to `ket_qua` for legacy compatibility; converts DataFrame/Series/numpy/NaN to valid JSON via `jsonable()`), closes matplotlib figures, and prints JSONL lines (`application/x-ndjson`) back to the browser.

### 3. Browser-side AI Assistant and the AI prompt field in CodeEditor

- **Configuration & store (`app/src/ai/config.ts`, `app/src/ai/store.ts`)**:
  - Defines 5 `ProviderId` values: `'anthropic' | 'openai' | 'google' | 'gateway' | 'compatible'` in the `PROVIDERS` constant.
  - `aiStore` (with the `useAI` hook via `useSyncExternalStore`) stores configuration in `localStorage` (`papercell.ai.config`, `papercell.ai.mode`, `papercell.ai.agent`, `papercell.ai.remember`). The API key (`papercell.ai.key`) is stored only in `sessionStorage` by default, and moves to `localStorage` only when the user enables `remember`.
- **Shared AI call function (`app/src/ai/ask.ts`)**:
  - `parseStream(raw)` separates answer text (`content`), status lines (`PROGRESS_MARK`), and errors (`ERROR_MARK`) from the raw stream.
  - `askAI({ messages, doc, signal, onUpdate })` checks `aiStore.get()`: if `mode === 'agent'`, sends to `/api/agents/chat`; otherwise sends to `/api/assistant/chat`, decodes the stream, and returns the full text on completion.
- **AI Assistant sidebar (`app/src/ai/AssistantPanel.tsx`)**:
  - Allows switching between 2 modes, `API key` and `Local agent`, rescanning agents (`/api/agents?refresh=1`), and loading model lists (`/api/ai/models`).
  - `docAsMarkdown(editor)` serializes the entire open article to Markdown (`figure` blocks become `[Figure: <caption>]` with a `js` code block) to send as context.
  - Displays answers with `ReactMarkdown` + `remarkGfm` + `remarkMath` + `rehypeKatex` (`normalizeMath` converts `\[ \]` and `\( \)` to `$$` and `$`). The **Insert** button (`insert(md)`) deserializes Markdown into Plate nodes and inserts them immediately below the current block.
- **Code editor & CodeAssist (`app/src/figure/CodeEditor.tsx`, `app/src/ai/skills/*.md`)**:
  - `CodeEditor`: wraps CodeMirror 6 with `js` and `python` support, preserving cursor position when receiving external code changes (dispatches only the diff). Autocomplete sources (`jsSource`, `pySource`) read `useCodeHints(params)` to suggest functions from `Plot`, `d3`, `pc`, `pd`, `np`, table names in `data`, column names, and parameter names.
  - `CodeAssist`: A prompt field for asking AI to write/edit figure code. Automatically attaches the relevant skill (`src/ai/skills/figure-js.md` or `figure-python.md`, loaded via `?raw`), table/column lists, current parameters, current code, and the other language's code for comparison (`contextBlock`).
  - **`@mention` syntax**: Typing `@` in `CodeAssist` opens a menu to select `@<dataset>` or `@<dataset>.<column>` (`updateMenu`, `parseMentions`). `profile()` uses `describeColumns` and `d3` to summarize data types and ranges (`min`, `max`, `mean` for numbers; date ranges for `date`; the 12 most common values for text) and attaches this to the prompt.
  - When `askAI` returns, `extractCode` extracts the first code block inside ` ``` ` and calls `onApply(got.code)` to update `CodeEditor` as an undoable step (`Ctrl+Z`).

### 4. Plate component customizations

- **`app/src/components/ui/dropdown-menu.tsx`**: In `DropdownMenuContent`, removed the class forcing the menu to match the trigger width (`w-(--radix-dropdown-menu-trigger-width)`), keeping only `min-w-32` so dropdowns (such as Figure, Export, Turn into) expand to fit their content.
- **`app/src/components/ui/block-draggable.tsx`, `app/src/components/ui/column-node.tsx` & `app/src/editor/side-drop.ts`**:
  - **Lark-style insertion line (`InsertGap`)**: At the top edge of each block (outside tables), leaving a 92px right-corner clearance (`right: 92px; z-index: 20`) so hovering the top-right AI/Delete buttons (`.text-cell-tools`, `z-index: 35`) never triggers accidental block insertion.
  - **`+` button next to the drag handle (`openInsertMenu`)**: Clicking `+` in a block's left margin moves to the current blank line (or creates one immediately below), then automatically types `/` to open the block insertion menu.
  - **Column block reordering & ungrouping (`column-node.tsx`, `side-drop.ts`)**: `KEYS.columnGroup` remains wrapped in `BlockDraggable` so the entire multi-column group keeps its own `+ / ⋮⋮` drag handle and AI/Delete toolbar (hidden via `.group\/container:has(.group:hover) > .slate-gutterLeft` when hovering inner column cells). Inner column cells reorder vertically without triggering side-drops (`canDropSide` returns `false` for same-column siblings and `sideOf` only activates in the middle vertical band `0.22..0.78`). Dragging a column's top-center `ColumnDragHandle` (`:::`) swaps columns horizontally within the same `column_group`, or drops onto `ColumnGroupEdgeDrop` or any top-level block in the article (`moveToColumnGroupEdge` in `side-drop.ts`) to move all blocks of that column out to full-width blocks and automatically unwrap single-column groups.
  - **Side drops create columns (`side-drop.ts`)**: In the innermost block's `onDragOver`, `sideOf(clientX, rect)` checks whether the cursor is in the left/right edge zone (`20%` of block width, at most `90px`). If valid (`canDropSide`, at most `MAX_COLUMNS = 4`), shows a vertical brand-colored line; on drop, `dropToSide(editor, ids, side.id, side.side)` groups the two blocks into a `column_group` (or adds a column to an existing group), then calls `equalize()` to distribute `%` widths equally.
- **`app/src/components/ui/column-node.tsx`**: Adds a vertical `.col-resize-handle` at the boundary between two columns (`!readOnly && !isLast`). `startResize` directly updates `style.width` on the two adjacent columns while dragging (keeping each column `>= 10%`), and only calls `editor.tf.setNodes` inside `editor.tf.withoutNormalizing` on release to create exactly one undo step.
- **Figure menu, `/` menu, and HTML export**:
  - `app/src/components/ui/figure-toolbar-button.tsx`: `FigureToolbarButton` (on `FixedToolbarButtons` in `app/src/components/ui/fixed-toolbar-buttons.tsx`) displays a 4-column grid of chart types from data (`CHART_TYPES` → `insertChart`) and a list of code templates (`FIGURE_TEMPLATES` → `insertFigure`, with a separate `controls-*` group for reader controls).
  - `app/src/components/ui/slash-node.tsx`: Adds 2 groups, `Charts from data` (`chartGroup`) and `Figure templates (code)` (`figureGroup`), immediately below AI in `SlashInputElement`, plus `VN()` to normalize Vietnamese by removing diacritics for quick searching in both Vietnamese and English.
  - `app/src/components/ui/export-toolbar-button.tsx`: `ExportToolbarButton` (`variant="toolbar" | "header"`, shared between the top header and the fixed editor toolbar) exports self-running HTML via `exportDocHtml`, PDF preview (`html2canvas-pro` at 2x + `pdf-lib` `embedJpg` with native PDF `/Outlines` sidebar bookmarks), PNG image snapshot, Markdown (with metadata and `## Contents`), and Word (`.docx`).

### 5. Build, viewer bundling, and running the app

- **Scripts in `app/package.json`**:
  - `npm run dev`: runs the Vite dev server on port `5173` (`app/vite.config.ts`), with a proxy forwarding all `/api` requests to `http://localhost:8787`.
  - `npm run dev:server`: runs `node scripts/server.mjs --watch` to compile and automatically restart the API server on port `8787` when code changes.
  - `npm run build`: runs `tsc -b && vite build && npm run build:viewer && node scripts/server.mjs` sequentially.
  - `npm run build:viewer`: runs `vite build -c vite.viewer.config.ts && node scripts/inline-viewer.mjs`.
  - `npm start`: runs `node server-dist/index.mjs`.
- **Server bundling with esbuild (`app/scripts/server.mjs`)**: Bundles `server/index.ts` into one ESM file, `server-dist/index.mjs` (`platform: 'node'`, `target: 'node22'`). Sets `loader: { '.css': 'empty' }` to skip CSS files pulled in by Plate's `BaseEditorKit`, and injects a `createRequire(import.meta.url)` banner for CommonJS packages.
- **Single-file reading page bundling (`app/vite.viewer.config.ts`, `app/scripts/inline-viewer.mjs`)**:
  - `vite.viewer.config.ts` builds `viewer.html` into `dist-viewer/` as a single chunk (`inlineDynamicImports: true`), while aliasing `python/kernel` to `src/viewer/kernel-stub.ts` and the MapLibre worker to `src/viewer/maplibre-worker.ts`.
  - `inline-viewer.mjs` reads JS and CSS from `dist-viewer/`, filters out duplicate KaTeX `woff`/`truetype` fonts (keeps only `woff2`), compresses with `gzipSync` at level 9, then base64-encodes and embeds them in `<script id="pc-css">` and `<script id="pc-js">`. When the file opens, the bootstrap script uses the browser's `DecompressionStream('gzip')` to decompress and load the reading page (reducing file size by roughly a factor of 3); the build script finally writes `dist/viewer.html` (preserving the `>__PC_DOC__<` placeholder for `exportDocHtml` to fill with article JSON).
- **Docker (`Dockerfile`, `docker-compose.yml`) and local execution (`run-local.bat`, `run-local.sh`)**:
  - **Docker**: Multi-stage build on `node:22-alpine` (with `python3`, `py3-pandas`, and `py3-numpy` installed in the runtime stage), runs `npm run build`, copies `dist/` and `server-dist/` into the runtime image with `NODE_ENV=production PORT=8787`. `docker-compose.yml` maps port `${PORT:-8765}:8787` (open at `http://localhost:8765`).
  - **Local execution**: `run-local.bat` (Windows) and `run-local.sh` (macOS/Linux) check Node.js, automatically run `npm install` if `node_modules` is missing, run `npm run build`, then set `PORT=8780 NODE_ENV=production` and run `node server-dist/index.mjs` (open at `http://localhost:8780`).

### 6. Extension points (files to edit)

1. **Add a server route**:
   - Create/update the handler in `app/server/<module>/...`.
   - Register the route in `app/server/index.ts` (under the `/api/...` prefix so the Vite proxy in `app/vite.config.ts` forwards it automatically during dev; guard with `if (!isLocal(c))` if the feature accesses host resources).
2. **Add an AI provider**:
   - `app/src/ai/config.ts`: Add the ID to the `ProviderId` type and a configuration entry (`label`, `defaultModel`, `defaultBaseURL`, `envVar`, `suggestions`…) to `PROVIDERS`.
   - `app/server/ai/provider.ts`: Add a `case` in `resolveModel(cfg)` to create the `LanguageModel`, and update the model-list endpoint/header handling in `listModels(cfg)` if it differs from standard Bearer token authentication.
3. **Add a local agent**:
   - `app/server/agents/local.ts`: Add an `AgentDef` entry to `AGENTS` (declare `id`, `label`, `bin`, `args` that must use read-only/sandbox mode, `promptInArgs`, and `makeParser` to extract `delta`/`progress`/`error`). If the agent commonly installs in its own directory outside `PATH`, add the path to `knownDirs(name)`.

### 7. Known gotchas

- **Docker cannot see host CLI agents**: The container is isolated (`existsSync('/.dockerenv')`) and cannot call `claude`, `codex`, or `agy` installed on the host. However, the Docker image bundles `python3`, `pandas`, and `numpy`, so `/api/python` and `/api/python/grid` work in both local and Docker deployments (`canUseServerPython` in `app/server/index.ts`).
- **`isLocal` restriction (`127.0.0.1`)**: Routes `/api/agents*`, `/api/python*`, and local-agent branches of `/api/ai/command` and `/api/ai/copilot` reject access from other machines over the LAN, unless the server environment variable `PAPERCELL_ALLOW_REMOTE_AGENTS=1` is enabled.
- **Agents run via `.cmd`/`.bat` on Windows**:
  - If an agent sets `promptInArgs: true` but only a `.cmd`/`.bat` version is found (`bin.shell === true`), `agentChat` blocks it with a 500 error because it will not pass the user's prompt through `cmd.exe` (avoids special-character errors and shell injection). On Windows, `resolveBin` already prefers `.exe` to avoid this gotcha.
  - On request cancellation or timeout on Windows, use `stopTree(child)` (`taskkill /pid <pid> /T /F`), not just `child.kill()`, which leaves child processes running in the background.
- **Plate editor AI follows the selected mode**: Direct editor commands (`Space`, `Ctrl+J`, Copilot ghost text) use the same saved API/local-agent selection as the AI Assistant. Local mode requires an installed, authenticated CLI rather than an API key; it buffers the answer before delivering Plate updates, so progress text does not appear in the article. Requests without `aiMode` continue to use API-provider configuration for backward compatibility.
- **Build order for `dist/viewer.html`**: `scripts/inline-viewer.mjs` writes directly to `dist/viewer.html` and checks `existsSync('dist')`, so always run `vite build` before `npm run build:viewer`.

### 8. Local agents — persistent sessions (multi-turn chat, model selection)

Alongside single-query mode (`/api/agents/chat`, `agentChat` in `local.ts`), sessions keep one CLI process throughout a conversation (like an Orca chat tab): the agent retains context between turns, with model and effort selection.

- **Shared contract `app/server/agents/drivers/types.ts`**: `AgentDriver` interface (`start`/`send`/`interrupt`/`close`/`alive`), `AgentEvent` events (`text`/`step`/`tool`/`done`/`error`), `DriverOptions` type (`model`, `effort`, `cwd`), `AgentModel`. **Do not edit this file before reviewing every consumer.**
- **Per-CLI drivers** (`drivers/claude.ts`, `drivers/codex.ts`, `drivers/agy.ts`, registered in `drivers/index.ts`): each driver maintains a process using its own protocol. Codex uses `codex app-server` (JSON-RPC, one thread/session); Claude and agy use `--input-format stream-json --output-format stream-json`. `interrupt()`: Claude and Codex interrupt in place, retaining context; **agy must kill the process and automatically restart on the next turn, losing context** (an agy stream-json limitation).
- **Models `app/server/agents/models.ts`** (`listAgentModels`): queries the CLI itself for models (agy `agy models`; codex `model/list`; claude control_request `initialize`), caches for 5 minutes, never throws (error → `{ models: [], warning }`). See `D:/Workspace/agent-proxy/catalog.py`.
- **Session management `app/server/agents/session.ts`**: `createSession`/`runTurn`/`interrupt`/`closeSession`/`listSessions`. Each session has its own temporary directory; writes `document.md` before each turn; injects instructions (`INSTRUCTIONS`) into the first turn; one turn at a time (busy → 409); dead process → automatically recreates the driver + emits a "Restarted…" step; at most 4 sessions, automatically closed after 20 idle minutes; closes all drivers when the server exits.
- **Routes `app/server/index.ts`** (all check `isLocal`): `GET /api/agents/models`, `GET/POST /api/agents/sessions`, `POST /api/agents/sessions/:id/turn` (streams NDJSON `AgentEvent`), `POST …/:id/interrupt`, `DELETE …/:id`. `/api/agents/chat` also accepts `model`/`effort`.
- **UI `app/src/ai/`**: `agent-session.ts` (client for the routes above), `store.ts` (stores model/effort per agent), `AssistantPanel.tsx` (model/effort selection, session chat, step display, Stop, New chat), `ask.ts` (AI prompt field below the code editor sends model/effort). **Adding a parameter type/agent/model requires synchronized changes across these files.**

---

## Part B. Figure cards, Design, Python precomputation, HTML export, editor

### 1. Data model and storage locations

- `app/src/editor/types.ts` defines `PapercellDoc = { version: 3, meta, data, content }`; `content` is a Plate node tree (`any[]`), which may contain nested columns.
- `DocMeta` contains `title`, `authors`, `date`, and optional `figurePadding`; `MetaContext` in `app/src/editor/DocHeader.tsx` provides metadata to the editor and figure cards.
- `FigureNode` is a void node: `type: 'figure'`, `id`, `caption`, `js`, `python`, `params`, `display`, `codeAccess`, `children: [{ text: '' }]`.
- Optional fields also stored on the figure node: `verify`, `spec`, `specDetached`, `padding`, `label`, `codeBackup`, `scenarios`, `autoOpen`.
- `display`: `output` / `both` / `code` / `hidden`; `codeAccess`: `none` / `js` / `python` / `both`. These fields control different things: layout and which code readers can see.
- `VerifyResult = { ok, message, at }` is the saved verification result; there is no fingerprint or automatic invalidation when JS/Python/params change.
- `FigureParam` contains `name`, `label`, `min`, `max`, `step`, `value`, and optional `kind`, `unit`, `options`; `ParamValue` is only `number | string | boolean`.
- `ParamKind` includes `range`, `select`, `radio`, `toggle`; `paramKind(p)` defaults to `range` when an older document has no `kind`; `isChoice` recognizes `select` and `radio`.
- Sliders use min/max/step; dropdowns/radios use `options`, preserving value types; toggles use booleans. Min/max/step remain required fields even for choices and toggles.
- `DataFile = { name, kind: 'csv' | 'json', content, labels? }`: stores text content in `PapercellDoc.data`, not parsed objects.
- `labels` maps original column names → display names, belongs to the data file, and is shared by all figures; changing labels does not change column keys in the data.
- `app/src/figure/runtime.ts`: `dataKey` removes the extension, replaces invalid characters with `_`, and prefixes a leading digit with `_`; `labelsOf` converts labels into a map keyed by that dataset key.
- `parseData` creates `Dataset = Record<string, unknown>`: CSV through `d3.csvParse(..., d3.autoType)`, JSON through `JSON.parse`, parse errors become `null`.
- `DataContext` contains `{ files, data, setFiles }`; this is runtime data in the React session, distinct from the `DataFile[]` array serialized in the document.
- `ChartSpec` in `app/src/figure/builder.ts` is stored at `FigureNode.spec`: `data`, `type`, channels `x/y/color/size/facet/lat/lon`, optional `filters?: string[]` (dataset columns exposed as interactive reader filter controls), `agg`, `bins`, `sort`, `xLabel/yLabel`, `scheme`, `basemap`.
- `ChartType` currently has 12 types: bar, barh, line, area, scatter, histogram, box, heatmap, table, map-points, map-heat, map-regions.
- `ScenarioCache` in `app/src/figure/scenarios.ts` is stored at `FigureNode.scenarios`: `grid`, `payload`, `count`, `bytes`, `fingerprint`, `engine` (`'local' | 'js' | 'pyodide'`), `at`, `seconds`, `failed`.
- Each `GridAxis = { name, values: ParamValue[] }`; `payload` is an array of precomputed results (`ket_qua` from Local Python or `expose(value)` from JS) in combination order, JSON → gzip → base64; `bytes` is the compressed byte count.
- `app/src/docs/store.ts`: localStorage holds the `papercell.index.v1` index, each article at `papercell.doc.<id>`, and the flag for adding the gallery once at `papercell.gallery.v1`.
- `loadDoc` only accepts version 3 with array content, then calls `upgradeDoc`; `saveDoc` writes the entire doc and updates its title/timestamp in the index.
- `emptyDoc` creates an empty paragraph; `ensureFirstDoc` adds the gallery once and a sample article when needed. localStorage write errors are caught and not reported to the user here.

### 2. Data import and column labels

- `app/src/data/import.ts`: `importFile` accepts CSV/TSV/TXT/XLSX/JSON/GeoJSON, limited to 20 MB/file; legacy XLS is rejected.
- CSV/TSV/TXT delimiters are detected and the data normalized to CSV; decimal-comma numbers are converted when the delimiter is `;` or tab; blank/duplicate headers are reassigned.
- XLSX uses dynamic import of `read-excel-file/browser`, with each nonempty sheet becoming a CSV `DataFile`; JSON/GeoJSON strings are preserved after JSON validation.
- `describeColumns` examines up to 2,000 rows, recognizes number/date/text and lat/lon by name + value range; `asRows` extracts the data array or properties from a GeoJSON FeatureCollection.
- `app/src/figure/DataPanel.tsx` manages adding/removing files, an 8-row preview, and label edits on blur; importing a file with the same name replaces the old one without automatically retaining its labels.
- `DesignTab.tsx` also supports file import and editing labels for columns in use; ungrouped tables allow editing all columns. `pc.label(dataset, column)` uses the trimmed label or returns the original column name.

### 3. Figure card lifecycle

- `app/src/figure/templates.ts` contains `FIGURE_TEMPLATES`, the `FigureTemplate` type, `figureFromTemplate`, `insertFigure`, `insertChart`, and the `insertNode` helper.
- Templates have `id/label/hint/icon/keywords/js`, with optional Python/params/caption; ordinary templates include sample data directly in JS and have no `spec`.
- The `data` template creates a default spec and `autoOpen: true`; `insertChart(editor, type)` creates a spec for the selected type, generates JS and `specParams`, and also opens Design automatically.
- `insertNode` replaces the current empty paragraph; otherwise inserts a node with `select: true`. Each new figure has `newId()` and an empty text child.
- `app/src/editor/papercell-kit.tsx`: `FigurePlugin` registers key `figure`, `isElement: true`, `isVoid: true`, component `FigureElement`; `PapercellKit` combines it with `EditorKit` and `DocHeaderPlugin`.
- `app/src/figure/FigureElement.tsx`: `FigureElement` finds the node path, then updates via `editor.tf.setNodes`; deletion uses removeNodes, and the Undo toast calls `editor.undo()`.
- `FigureCard` is shared by editor and viewer: renders the chart, controls, caption, inline code, hover badges (`JS` and `Python` buttons opening the Code tab in their respective languages), and a button to open `FigureDialog`; `FigureNumbers` provides label strings by id.
- The card keeps parameters being dragged in state; the editor writes back to the node only on commit, while readers change session state. The `latestParams` ref prevents committing stale values after dropdown/toggle changes.
- `autoOpen` opens the Design tab once, then is removed from the node; the edit button opens Design when a spec is still attached, JS for other figures; clicking/expanding a figure opens the Figure tab.
- `app/src/figure/FigureView.tsx` measures width with ResizeObserver, rounded to 10 px increments with a minimum of 200; code does not run before width is available.
- The View reruns `runFigure` when JS, parameter names/values, data, width, scenario payload, or labels change; discards outdated asynchronous results.
- DOM results are appended, HTML strings assigned to `innerHTML`, and errors placed in `.fig-error`; React does not directly draw Plot/MapLibre content.
- Before replacing output and on unmount, the View calls `__pcCleanup` on child elements; `releaseNode` also cleans the root node of late-arriving results.
- `app/src/figure/runtime.ts::runFigure` creates an `AsyncFunction`, passing `Plot`, `d3`, `data`, `width`, `expose`, `params`, `pc`, `result`, `ket_qua` (legacy alias), then each parameter by name.
- `params` is a name → value object; each name is also a direct variable. `expose(v)` records the last value for verification and returns v itself.
- `pc.map(options)` calls `makeMap({ width, ...options })`, so figure code can override width; `pc.esc` escapes HTML; `pc.label` looks up a column's display name.
- `result` (and legacy alias `ket_qua`) is the nearest cache entry for the parameters, or `undefined` when there is no cache; runFigure does not automatically run Python.
- `RunOutput` contains `{ node, html, exposed, error }`; only accepts a Node or HTML string as the return value; compilation/runtime errors are caught as messages.
- Despite its legacy name, `ParamSliders` renders all four kinds; range snaps to the grid using `snap`, select/radio return the original option, toggle returns a boolean and commits immediately after a change.

### 4. Popup and code editor

- `app/src/figure/FigureDialog.tsx`: `DialogTab` includes `design`, `figure`, `code` (plus legacy `'js' | 'python'` normalized to `'code'`), `params`, `verify`, `scenarios`, `settings`; the popup portals into `document.body`.
- The **Design** tab uses `DesignTab` (including interactive **Scenario / filter controls** toggled from dataset columns); the **Figure** tab uses a large `FigureView` and `ParamSliders`; parameter state is shared with the card.
- The **Code** tab uses `CodeTab` with a segmented language switcher between **JavaScript (Draws figure)** and **Python (Verify & precompute)**, alongside live preview and `CodeAssist`.
- `CodeTab` keeps a draft and updates the node after a 400 ms debounce; JS still attached to Design goes through `syncFromCode`, while Python is saved directly.
- The **Parameters** tab uses `ParamsTab`: edit a draft or pick **+ Add from data column…** (`paramFromColumn`) to populate options/ranges directly from any uploaded dataset column, then click Save parameters.
- `parseOptions` converts true/false strings to booleans and numeric strings to numbers; toggles store booleans. Preserve this rule so the string "false" is not treated as truthy.
- The **Verify & Precompute** tab (`ComputeTab` in `FigureDialog.tsx`) combines local Python/JS verification (`VerifyTab`/`verifyFigure` against `/api/python/grid`, saving `VerifyResult`) and parameter-grid precomputation (`ScenarioTab`, running either Local Python `result` or JavaScript `expose(value)`) with a segmented mode switcher; **Settings** edits padding/display/label/codeAccess.
- Read-only mode has only Figure and the unified Code tab (with language switcher when both JS and Python are allowed by `visibleCode`). `visibleCode` also determines inline code in the card when reading.
- The popup locks scrolling with `modal-open`, keeps the close callback in a ref, focuses once on opening, and restores focus on closing; avoid rerunning effects that steal focus from someone typing.
- `app/src/figure/CodeEditor.tsx`: CodeMirror 6 for JS/Python; `useCodeHints` gets datasets/columns/params/labels from context; Ctrl+Space suggests Plot, d3, data, and parameter variables.
- External value changes dispatch the smallest diff to preserve caret/scroll and undo; code editor keystrokes do not propagate to Plate.
- `CodeAssist` builds context from current code, the other language's code, params, labels, and profiles of @mentioned data; uses `askAI` and raw-imported figure-js/figure-python skills.
- AI returns a complete fenced code block, then `onApply` goes through the same `change` flow; this is not a separate rendering/execution pipeline.

### 5. Design, codegen, and document compatibility

- `app/src/figure/builder.ts`: `CHART_TYPES` holds icon/label/channels/required metadata and agg/bins/sort/map flags; `typeInfo`, `missingChannels`, and the UI rely on this list.
- `defaultSpec` defaults to bar/count, 20 bins, no sorting, blues, light; `SCHEMES` / `SCHEME_META` provide named color palettes alongside custom `#hex` / `#hex1,#hex2,...` multi-stop palettes (`isCustomScheme`, `parseCustomColors`, `customScaleColors`); `specParams` creates a `so_cot` slider for histograms plus filter controls from `spec.filters`.
- `codegen` generates readable JS: Plot for charts, HTML tables for tables, `pc.map` for maps; missing required datasets/channels return an HTML message instead of rendering.
- Axis/legend/table labels are looked up at runtime through `pc.label`; line/area sort by X before connecting points; layout computes margin/rotate/facet from the data.
- `chartLine` writes exactly one `const chart = {...}` line; `SPEC_KEYS` is a whitelist of configuration fields to serialize/read back, not an arbitrary entire object.
- The configuration line is metadata for regenerating code; the JS below is already generated from the spec, not a generic renderer that simply reads the chart variable at runtime.
- `parseChartLine` finds the first line using a start-of-line regex, tries JSON then an object literal via `new Function`; only accepts types in `CHART_TYPES`, fills missing defaults.
- `syncFromCode(spec, js)` compares everything outside the chart line with `codegen(spec)`; differences in body/comments/whitespace outside that line → `'detached'`.
- Editing only a valid chart line → updates the spec and regenerates the code body, preserving the exact line the user typed; a line still being typed that is not yet valid → `'pending'`.
- `CodeTab` sets `specDetached: true` when detached; pending only saves JS; successful sync replaces spec/JS/params and retains old values for parameters with the same names.
- `app/src/figure/DesignTab.tsx`: `mergeParams` also retains old values with matching names; the tab selects the first suitable dataset, prefers GeoJSON for map-regions, and guesses lat/lon when needed.
- With `specDetached`, or with no spec but nonempty JS, Design only previews and does not overwrite JS when opening the tab/changing selections.
- Only `apply(next, true)` on the Use this design button allows replacing handwritten code; saves `codeBackup = { js, params, spec, specDetached }`, not Python or the entire FigureNode.
- `restore` restores the backed-up fields, then deletes the backup; for detached figures with a spec, changing selections may still update the spec but does not replace the JS/params used for execution.
- `app/src/editor/upgrade.ts::upgradeDoc` recursively visits figures in the tree, regenerating JS when a spec exists and is not detached; opening old articles automatically picks up builder fixes.
- Gallery upgrades use the `GALLERY_TITLE` / old Vietnamese title, adding `paramsDemo`/`controlsSection` if absent; this is not a general schema migration for every version.
- For the Vietnamese gallery previously overwritten by Design: retrieves originals from `app/src/legacy/gallery-vi.ts` by caption, restores handwritten figures where appropriate, and keeps existing ids.
- `app/src/gallery.ts::makeGallery` creates synthetic data and spec/code/template figures; `app/src/demo-params.ts` contains `PARAMS_DEMO_ID`, `CONTROLS_ID_PREFIX`, and control demos used for new articles and upgrades.

### 6. Precomputation (Local Python or JavaScript) and verification

- `app/src/figure/scenarios.ts::axisValues`: range enumerates min to max by step, choice uses every option, toggle uses `[false, true]`; even without params there is one combination.
- `comboCount`, `comboAt`, `indexOf` share an ordering where the last parameter changes fastest; numeric lookup selects the nearest point, other types compare via String and fall back to the first item.
- `snap` uses the same nearest-point selection; `encodeResults`/`decodeResults` compress/decompress via `app/src/lib/pack.ts`, with decoded results memoized by a shortened payload key.
- `fingerprint` takes 16 hex characters from the SHA-256 of engine + source code (`fig.js` when `engine === 'js'`, otherwise `fig.python`) + file names/contents + grid.
- `app/src/figure/ScenarioTab.tsx` offers two engines under **Run with**: **Local Python (`result`)** (runs `fig.python` on the server via `POST /api/python/grid`) and **JavaScript (`expose(value)`)** (runs `fig.js` in the browser for each combination via `runFigure` and caches `res.exposed` into `result`). Browser Pyodide has been removed from the Precompute and Verify UI.
- The grid can use a larger step than the slider to reduce computations; warns above 2,000 combinations, blocks above 50,000.
- Local POST `/api/python/grid` sends `{ code, files: [{ key, kind, content }], combos }`, receives streaming JSONL `{ i, ok, value?, error? }` or `{ fatal }`.
- `readJsonLines` retains partial lines between chunks and processes the final line; AbortController stops in-flight local Python or JS runs.
- A new cache is written only after all items arrive and not all have failed; failed items remain `null`, with a failed count; stopping/errors preserve the old cache.
- Staleness is reported by comparing fingerprints using `cache.grid` and `cache.engine`.
- `app/src/figure/verify.ts::verifyFigure` runs JS at width 600 without passing a scenario cache, retrieves `expose`, and calls `POST /api/python/grid` on the local/Docker Python server with a single-item combo.
- Comparison flattens objects with sorted keys; supports Map/Date on the JS side, numbers within tolerance `1e-9 + 1e-6 * max(abs(a), abs(b))`; verifies only the current parameter set.

### 7. HTML export and viewer

- `app/src/publish/export-html.ts::exportDocHtml` fetches `/viewer.html`, checks the `>__PC_DOC__<` placeholder, and rejects dev templates still referencing `/src/viewer/`.
- `forPublish` walks the tree, removes hidden figures and verify/spec/specDetached/autoOpen fields, deletes Python if codeAccess does not allow viewing; keeps JS to run figures and retains data/scenarios.
- Export packs `{ version: 3, meta, data: files, content }` with `packText`, replaces the placeholder and escaped title, downloads an HTML Blob named via `docSlug`.
- `app/vite.viewer.config.ts`: separate build into dist-viewer, inlines dynamic imports, one CSS bundle, disables module preload, inlines assets with a very large threshold.
- The viewer alias replaces python/kernel imports with `app/src/viewer/kernel-stub.ts`; the stub rejects verify/runGrid and does not load Pyodide. Aliases the MapLibre worker to `viewer/maplibre-worker.ts`.
- `app/scripts/inline-viewer.mjs` reads dist-viewer/viewer.html and JS/CSS assets, removes redundant KaTeX woff/ttf fonts, gzip/base64-encodes each bundle, embeds them in dist/viewer.html.
- Bootstrap uses `DecompressionStream('gzip')`, adds styles and imports JS from a Blob URL; the script checks that no asset references remain in the HTML and that the document placeholder still exists.
- `app/src/viewer/main.tsx::readDoc` reads the `papercell-doc` script, decompresses/parses it; `Viewer` creates a static editor with `BaseEditorKit` + `FigureStaticPlugin`, without calling `upgradeDoc`.
- Viewer builds DataContext/MetaContext/FigureNumbers from embedded data, `parseData`, and `scan`; setters are no-ops; title/authors/date and the h1–h3 TOC render outside the static content.
- `app/src/figure/FigureStatic.tsx` uses readOnly `FigureCard`, so controls/popup still work; filters data-slate attributes to avoid copying code strings into DOM attributes.
- `app/src/viewer/maplibre-worker.ts` imports the raw MapLibre worker, removes the final export, creates a Blob classic worker, and replaces `window.Worker` for viewer module-worker requests.
- Reason given in the code: Chrome blocks module workers from blobs when opened via file://, and MapLibre also wraps imports in blobs because the origin is null; an embedded classic worker without imports avoids this flow.
- The shim assumes only MapLibre uses module workers in the viewer; adding other module workers requires revisiting the shim. The editor version of `app/src/figure/map.ts` still uses the normal `?worker&url` import.
- Offline viewing of exported HTML files: Google Fonts links were removed in favor of bundled local `@fontsource-variable/geist` and KaTeX fonts, and `app/src/figure/map.ts` provides a bounded offline vector grid basemap (`offline` / `buildBoundedOfflineStyle`, restricted strictly to the displayed data's coordinate box + 15% padding) with automatic fallback when `navigator.onLine === false` or when OpenFreeMap tiles fail/time out.
- `app/scripts/server.mjs` is only an esbuild server-bundling script, omitting CSS and restarting with --watch; it is not part of the viewer embedding pipeline and must not be run in this task.

### 8. Numbering, columns, and padding

- `app/src/editor/scan.ts::scan` traverses in tree order, including column_group/column, counting Figure and Table separately; only figures with nonblank captions, not hidden, and a label other than none are numbered.
- `captionKind`: prioritizes `fig.label`; otherwise, spec.type table → Table; figures without a spec whose JS matches the literal `<table class="fig-table` → Table; everything else is Figure.
- `NEXT_CAPTION` cycles Figure → Table → none → Figure; Settings offers Automatic by deleting label. Headings only enter the outline when they are h1–h3 and have an id.
- `app/src/editor/side-drop.ts`: `sideOf` recognizes left/right edge zones of 20% width, up to 90 px; `sideTarget`/`useSideTarget` is an external store for the hover indicator.
- `canDropSide` allows root, group, or direct blocks within columns as targets; at most four columns; `dropToSide` prevents dropping a block onto itself or its descendants.
- `dropToSide` runs withoutNormalizing, removes dragged paths from last to first, then finds the target again by id; creates a new group or adds a column to an existing group, with `equalize` distributing percentage widths equally.
- `FigureCard` computes padding with `fig.padding ?? meta.figurePadding ?? DEFAULT_FIG_PADDING` (12 px), applying it only to the inline figure area; the popup has separate CSS padding.
- Apply to all figures changes `meta.figurePadding`, removing all `padding` overrides on figure nodes via setNodes matching the entire tree; 0 is valid, so do not replace `??` with `||`.
- `app/src/figure/figure.css` defines card/output/dialog/controls/table/map and resize-handle styles; `papercell.css` holds shared styles, `viewer/viewer.css` handles reading-page/TOC layout.
- In `app/src/lib/`, `pack.ts` directly supports scenarios/export; `utils.ts` only re-exports `cn`.
- `block-discussion-index.ts` indexes discussions/suggestions by block, `suggestion.ts` contains suggestion style variants; `markdown-joiner-transform.ts` joins Markdown chunks for AI streaming/deserialization.
- `uploadthing.ts` defines an upload router that blocks access outside development if authentication is not configured; this is not the DataFile import path used by `DataPanel`/`importFile`.

### 9. Extension points: files to edit

- **New Design chart type:** requires `app/src/figure/builder.ts`: add ChartType, CHART_TYPES, a codegen branch, labels/defaults/SPEC_KEYS for new fields, specParams if controls are needed.
- `app/src/figure/DesignTab.tsx` automatically renders existing CHART_TYPES/channels/flags; edit only if the new type needs controls, dataset conditions, or new channels outside the current schema.
- To extend map capabilities, edit `app/src/figure/map.ts`; to change automatic Table detection, edit `app/src/editor/scan.ts`; add spec examples in `app/src/gallery.ts` for easy testing.
- **New template:** add an entry in `app/src/figure/templates.ts`, or `app/src/figure/control-templates.ts` for the reader-controls group already spread into FIGURE_TEMPLATES; ids must be unique.
- Templates use JS returning DOM/HTML, parameters with correctly typed defaults, optional Python, and self-contained sample data; add examples to `gallery.ts` or `demo-params.ts` if needed. Menu consumers outside the review scope must be checked by Claude during integration.
- **New parameter kind:** edit `app/src/editor/types.ts`, `app/src/figure/FigureView.tsx`, `app/src/figure/FigureDialog.tsx`, `app/src/figure/scenarios.ts`, `app/src/figure/CodeEditor.tsx`.
- Synchronize backward-compatible types/defaults, parameter input UI and validation/serialization, reader controls/commit, axisValues/lookup/snap, autocomplete/AI descriptions; add styles in `figure.css`, examples in `control-templates.ts`/`demo-params.ts`.
- If values remain number/string/boolean, the runtime and worker already pass them generically; more complex types require updating ParamValue, the kernel/worker contract, and related lookup/String/JSON operations.

### 10. Gotchas and risks to account for when editing

- Nested JS/Python/HTML code strings and regex have multiple escape layers (`builder.ts`, templates, worker GLUE, inline-viewer); use file editing tools, not shell heredocs, per AGENTS.md.
- MapLibre retains WebGL contexts: preserve `__pcCleanup`/`map.remove()`, ResizeObserver cleanup, and cleanup of late results; multiple unreleased maps may turn into black rectangles.
- `makeMap` computes bounds from raw coordinates instead of `d3.geoBounds` to avoid GeoJSON polygon winding issues; do not substitute algorithms merely because function names look equivalent.
- Do not regenerate handwritten code just because Design opens; do not arbitrarily remove specDetached/codeBackup; changing codegen affects every figure still attached to Design when `upgradeDoc` runs.
- Table detection from JS uses a literal regex, not HTML parsing: changing class/syntax order may change numbering when no spec remains, especially after export removes the spec.
- `codeAccess` controls UI visibility: JS remains in the HTML for execution; `forPublish` currently also preserves `codeBackup` through a rest spread. Changes that remove internal data must account for nested backups too.
- `runFigure`/`parseChartLine` use Function and HTML output uses innerHTML, with no sandbox in these functions; parameter names can still collide with runtime variables/keywords despite passing the identifier regex.
- `parseData` cache keys use name/length/first 64 characters; `decodeResults` uses length/first and last 48 characters. Data may be reused if its middle changes while these key parts stay the same.
- CodeTab cancels its timer on unmount without flushing the draft; switching tabs/closing very quickly after typing risks losing the last 400 ms of changes. This is inferred from code, not tested in the UI.
- Verify does not run with the scenario cache, check the full grid, or automatically refresh the badge when code changes; figures rendered solely from precomputed ket_qua must account for this contract.

---

## Part C. Known unresolved risks

The following issues were found during code review and have not been fixed. Assign separate tasks to address them.

- **HTML export still includes `codeBackup`:** `forPublish` (`app/src/publish/export-html.ts`) removes `verify/spec/specDetached/autoOpen` but retains `codeBackup`, so old handwritten code (replaced by a design) remains in the exported file.
- **The last 400 ms of typing may be lost:** `CodeTab` cancels its timer when the popup closes without saving the draft (not tested in the UI).
- **Weak cache keys:** `parseData` keys on name + length + first 64 characters, `decodeResults` on length + first/last 48 characters; changing the middle of the data while preserving these parts may reuse old results.
- **Verification does not automatically expire:** `VerifyResult` has no fingerprint, so editing JS/Python/parameters after verification still shows "Verified".
- **String-based Table detection:** figures without a spec only count as Table if JS contains exactly `<table class="fig-table`.
