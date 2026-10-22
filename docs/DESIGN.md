# Papercell: design document

Papercell is a Lark Docs-style editor for scientific articles. Each figure in an article is a Python cell that runs directly in the browser. Articles are published as interactive web pages and can be exported to PDF.

## 1. Goals

| Goal | What it means in practice |
|---|---|
| Accessible to everyone | Edit with the mouse as in Lark/Notion, without knowing Markdown or installing Python |
| Living articles | Figures are generated from code and update when data or parameters change |
| Two separate interfaces | **Editing** (for authors) and **Publishing** (for readers) |
| AI assistance | Agents write paragraphs and figure code, test it, and propose changes; controlled via MCP |
| Open | MIT license, self-hosted with Docker |

**Out of scope for the demo:** collaborative editing, user accounts, running Python on the server.

## 2. Architecture

```
┌──────────────────────────── Browser ─────────────────────────────────────┐
│  Editor (React + Plate)             Publisher (React, read-only)         │
│        │  JSON document                     ▲                            │
│        ▼                                    │                            │
│  Python kernel (Pyodide in Web Worker) ───────┘ results: SVG/HTML/text   │
└───────────────▲──────────────────────────────────────────────────────────┘
                │ WebSocket (AI phase)
┌───────────────┴────────────────┐
│ Small Node server: app serving │◄── Claude Desktop / Claude Code (MCP)
│ + MCP server + bridge          │
└────────────────────────────────┘
```

- **The first demo is a static site:** Vite builds HTML/JS files, served by nginx in Docker.
- **The Node server is only added in the AI/MCP phase,** because MCP needs a process for external agents to connect to.

## 3. Technology

| Component | Choice | License |
|---|---|---|
| UI framework | React 19 + Vite + TypeScript | MIT |
| Editor | Plate (`platejs`, `@platejs/*`), based on Slate | MIT |
| Column layout | `@platejs/layout` | MIT |
| Python | Pyodide (geopandas, shapely, rasterio, h3, scipy, sklearn, statsmodels, matplotlib, duckdb…) | MPL-2.0 |
| Maps | MapLibre GL | BSD-3 |
| Equations | KaTeX (via `@platejs/math`) | MIT |
| AI | `@platejs/ai` for the UI, `@modelcontextprotocol/sdk` for MCP | MIT |
| PDF | Typst (WebAssembly version) or browser printing; choose in phase 5 | Apache-2.0 |

## 4. Document format

Each document is a JSON file (`*.papercell.json`) for easy storage in Git and easy reading/editing by AI.

```jsonc
{
  "version": 1,
  "meta": { "title": "...", "authors": [{ "name": "...", "affiliation": "..." }], "date": "2026-10-18" },
  "page": { "size": "A4", "margins": [25, 25, 25, 25], "width": "standard" },
  "params": { "ban_kinh": { "type": "slider", "min": 200, "max": 2000, "step": 50, "value": 800, "unit": "m" } },
  "references": [{ "id": "uber2018", "doi": "..." }],
  "content": [ /* Plate block tree */ ]
}
```

### Block types

| Block | Main properties |
|---|---|
| Text: `h1–h3`, `p`, `blockquote`, lists | `align`, `indent` |
| `column_group` → `column` | `width` (percentage) |
| **`python`** | `code`, `display`, `caption`, `label` (for references such as "Figure 1"), `outputs` (pre-saved results) |
| **`param`** | Variable name in `params`; shown as a slider / select / number input |
| `equation` | TeX, with numbering |
| `table`, `image`, `callout` | as in Lark |
| `citation` (inline) | `refId` |

### Python cell display modes (`display`)

| Value | Editing | Publishing |
|---|---|---|
| `both` | Code + output | Code + output |
| `output` | Collapsed code, click to expand | Output only, with a **‹/› Code** button |
| `code` | Code only | Code only |
| `hidden` | Dimmed, labeled "hidden when published" | Not shown (still runs) |

`outputs` are **saved in the file in advance**. The published page shows figures immediately, without waiting for Pyodide to load (about 10 MB). Python only starts when a reader moves a slider or clicks run.

## 5. Python kernel

- One Web Worker maintains **a shared variable namespace** for the entire article, as in Jupyter.
- Before running a cell, automatically install packages based on its `import` statements (`loadPackagesFromImports`).
- Collect output in this order of priority:
  1. matplotlib figure → SVG
  2. Final value with `_repr_html_` (DataFrame…) → HTML
  3. GeoDataFrame → GeoJSON → map block (phase 2)
  4. Anything else → text
- `stdout` and `stderr` are also displayed. Errors show a shortened traceback.
- **Parameters:** before each run, parameter values are assigned to Python variables with the same names. Moving a slider reruns cells **that mention that variable name** and the cells after them, in article order.

## 6. Two interfaces

| | Editing | Publishing |
|---|---|---|
| URL | `/#edit` | `/#read` (later: a separately exported static HTML file) |
| Toolbar, block drag handles, `/` menu | yes | no |
| AI panel | yes | no |
| `hidden` cells | dimmed | not shown |
| Table of contents, "Show all code" button, Citations, Download PDF | – | yes |
| Typography | sans, compact for editing | serif, comfortable for extended reading |

## 7. AI agents and MCP (phase 4)

The editor's AI panel and the MCP server **share the same toolset**:

| Tool | Purpose |
|---|---|
| `get_document` / `get_outline` | Read the article (in full or as an outline) |
| `insert_blocks`, `update_block`, `delete_block`, `move_block` | Edit content |
| `set_columns`, `set_alignment` | Edit layout |
| `add_python_cell`, `run_cell` | Write and run code; return text and **figure images** for the agent to inspect |
| `add_param`, `set_cell_display`, `add_reference` | Parameters, display, references |

- All agent changes enter a **suggestion queue**. The author accepts or rejects each change.
- The MCP server runs in the Node server and connects to the editor tab via WebSocket. Python code still runs in the browser.

## 8. Demo roadmap

| Phase | Scope | Complete when |
|---|---|---|
| **1** | Editor: text, alignment, columns, Python cells + 4 display modes, save/open files. Docker. | A two-column article with a working matplotlib figure can be authored |
| 2 | Parameter blocks (sliders) + dependency reruns; equations; `/` menu, block drag-and-drop, column resizing *(done)*; citations; map blocks | Moving a slider changes the figure |
| 3 | Publisher: reading interface, table of contents, code button, static HTML export | Others can read the article from a shared link |
| 4 | AI panel + MCP server | Claude can write a new figure from a single prompt |
| 5 | PDF export (page size, margins, snapshots of interactive figures) | Produces a PDF suitable for submission |

## 9. Known risks

- **Pyodide is slow to load the first time** (about 10 MB plus packages). Mitigations: pre-save outputs, load only when needed, use the browser cache.
- **Pyodide lacks PySAL, osmnx, plotly.** Try `micropip` or provide alternative functions.
- **Large datasets** (over roughly 100 MB) are unsuitable for browser execution. Add a server-side kernel option later.
- **Vietnamese input methods (Unikey/Telex):** the Slate-based editor needs thorough testing.
