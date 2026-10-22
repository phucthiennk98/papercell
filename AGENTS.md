# AGENTS.md — How agents work on the Papercell project

## Roles

| Agent | Role | May do | Must not do |
|---|---|---|---|
| **Claude (Claude Code)** | **Coordinator** | Talk to the user, understand requirements, break down work, write a brief for each task, assign it to Codex / Antigravity, review diffs, check in the browser, build, commit, report to the user | Write most of the code directly. Claude only edits directly when a task is tiny (a few lines) or when integration/fixes are needed after a worker finishes |
| **Codex** | **Worker** | Receive a brief from Claude, edit only assigned files, run checks, return a report | Commit, push, switch branches, edit files outside the brief's scope, expand requirements independently |
| **Antigravity (agy)** | **Worker** | Same as Codex | Same as Codex |

Only **Claude** receives user requests and decides what to do and who does it. Workers (Codex, Antigravity) only receive tasks from Claude.

## Project

**Before doing anything, read [`docs/CODEBASE.md`](docs/CODEBASE.md)** (codebase map: architecture, data flow, extension points, known gotchas). Any task that changes the architecture must update that file as part of the same task.


**Papercell**: a Lark Docs-style editor for scientific articles. Figures use JS (Observable Plot / D3, MapLibre maps), with original Python code for verification and precomputation, and export to a single HTML file that can be opened anywhere.

- `app/`: the entire application (React 19 + Vite 8 + TypeScript, Plate v53 editor, Tailwind v4 + shadcn).
  - `src/figure/`: figure cards: runtime, Design tab (`builder.ts`, `DesignTab.tsx`), popup (`FigureDialog.tsx`), code editor (`CodeEditor.tsx`), maps (`map.ts`), precomputation (`scenarios.ts`, `ScenarioTab.tsx`), figure templates (`templates.ts`, `control-templates.ts`).
  - `src/components/`: Plate components (imported via shadcn and modified).
  - `src/editor/`: document data types (`types.ts`), legacy document upgrades (`upgrade.ts`), drag-and-drop column creation (`side-drop.ts`).
  - `src/ai/`: AI Assistant, skills for writing figure code (`skills/*.md`).
  - `src/viewer/`: reading page used for HTML exports.
  - `server/`: Hono server (AI, local agents, local Python).
- `run-local.bat` / `.sh`: build and run locally (port 8780). `docker-compose.yml`: Docker deployment (port 8765).

## Mandatory conventions

- **The UI must use English only** (buttons, menus, messages, errors). Article content may use any language.
- All new filenames, content, comments, documentation, and commit messages must use English. Article content may use any language; existing comments do not need translation.
- Code comments must be concise and match the tone of the file being edited.
- New code must match its surroundings: naming, line length, comment density.
- Edit strings containing escapes (`\n`, regex) with file editing tools, not shell heredocs (which have repeatedly damaged code).
- Do not install additional libraries unless the brief permits it.
- Do not run servers on ports **8780** or **8765** (the user starts/stops those). Use another port or a static build for testing.

## Checks before reporting completion (workers)

Run in the `app/` directory:

```bash
npx tsc -b
npx vite build
npm run build:viewer
```

All three must pass without errors. Also perform any additional checks required by the brief.

## Workflow

1. **Claude** receives the request, reviews relevant code, and splits it into independent tasks. Each task touches one group of files; two workers must never edit the same file at the same time.
2. **Claude** writes a brief (template below) and assigns it **through Orca**, so the user can follow each worker in its own tab:
   - Create a Run: `orca orchestration run-create --objective "<objective>" --json`
   - Assign work: `orca orchestration worker-start --run <run_id> --spec "<brief>" --task-title "<short title>" --worktree "path:D:/Workspace/projects/project_01" --agent codex|antigravity --json`
   - Wait for results: `orca orchestration check --run <run_id> --wait --types "worker_done,escalation,question" --json`; after processing, use `--ack <delivery_id>` and `worker-release --dispatch <dispatch_id>`.
   - Workers write reports to `.agent-reports/<name>.md` (ignored by Git) and send `worker_done` with `--report-path`.
   - Fallback when Orca is unavailable: `codex exec -s workspace-write -C "D:/Workspace/projects/project_01" "<brief>"` or `agy -p "<brief>" --mode accept-edits`.
3. **Workers** follow the brief, run checks, and return a report (template below). **Do not commit.**
4. **Claude** reads `git diff`, reruns checks, tests UI changes in the browser, and finishes any integration fixes. If anything is missing, send it back to the worker with specific feedback.
5. **Claude** commits (with an English message describing what changed and why) and reports to the user.

### Brief template (Claude → worker)

```
TASK: <one sentence describing the desired outcome>
CONTEXT: <why this is needed, what the user said>
FILES ALLOWED TO EDIT: <file list; do not touch anything outside it>
DETAILS:
- <requirement 1>
- <requirement 2>
DONE WHEN: <verifiable criteria, e.g. "tsc + vite build pass; template X shows dropdown Y">
DO NOT DO: <what is out of scope>
```

### Report template (worker → Claude)

```
DONE: <summary of changes by file>
CHECKS: <commands run and results, verbatim if there are errors>
UNFINISHED / BLOCKED: <remaining work, reasons, questions for Claude>
```

## Notes for workers

- If the brief is unclear, record questions under "UNFINISHED / BLOCKED" and stop; do not guess.
- Report bugs found outside the scope; do not fix them independently.
- Do not delete or rename files, or run Git commands that change history (commit, reset, checkout, rebase, push).
