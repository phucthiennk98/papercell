import * as d3 from 'd3'
import type { PlateEditor } from 'platejs/react'
import { asRows, describeColumns, type Column } from '@/data/import'
import { newId, type DataFile, type FigureNode, type FigureParam, type ParamKind, type ParamValue } from '@/editor/types'
import { CHART_TYPES, codegen, defaultSpec, specParams, type ChartSpec, type ChartType } from '@/figure/builder'
import { dataKey, labelsOf, type Dataset } from '@/figure/runtime'
import skillJs from './skills/figure-js.md?raw'
import skillPy from './skills/figure-python.md?raw'
import skillMath from './skills/equation-math.md?raw'

/** Model hay viết công thức bằng \( \) và \[ \]; đổi sang $ và $$ để Markdown không nuốt dấu \ và để vẽ bằng KaTeX. */
export function normalizeMath(md: string) {
  return md
    .replace(/```(?:latex|math|tex|katex|papercell-equation)\s*\n([\s\S]*?)```/gi, (_, m: string) => '\n$$\n' + m.trim() + '\n$$\n')
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => '\n$$\n' + m.trim() + '\n$$\n')
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => '$' + m.trim() + '$')
}

export const FIGURE_PROMPT_GUIDE = `
## Creating or inserting Papercell figures (interactive charts, tables, maps, simulations)
When the user asks to create, add, suggest, or insert a chart, figure, plot, map, or interactive model, output a fenced \`\`\`papercell-figure block containing a single valid JSON object (you may include explanatory Markdown paragraphs before or after the fence).
When inserted into Papercell, a \`\`\`papercell-figure block becomes a live interactive FigureNode card in the document JSON with working controls/sliders.

Schema for \`\`\`papercell-figure:
\`\`\`papercell-figure
{
  "caption": "Concise figure caption describing the chart",
  "spec": {
    "data": "dataset_key",
    "type": "bar",
    "x": "column_x",
    "y": "column_y",
    "color": "optional_group_col",
    "agg": "count"
  },
  "params": [
    {
      "name": "max_distance",
      "label": "Max distance",
      "kind": "range",
      "min": 0.5,
      "max": 5,
      "step": 0.5,
      "value": 2,
      "unit": "km"
    }
  ],
  "js": "const rows = data.dataset_key.filter(d => d.distance <= max_distance);\\nexpose(rows.length);\\nreturn Plot.plot({ width, height: 280, x: { label: pc.label(\\"dataset_key\\", \\"column_x\\") }, y: { grid: true, label: \\"Count\\" }, marks: [Plot.barY(rows, Plot.groupX({ y: \\"count\\" }, { x: \\"column_x\\", fill: \\"#2a78d6\\", tip: true })), Plot.ruleY([0])] });",
  "python": "df = data[\\"dataset_key\\"]\\nket_qua = int((df[\\"distance\\"] <= max_distance).sum())"
}
\`\`\`

Rules for \`\`\`papercell-figure:
- Always include \`"caption"\`, \`"params"\` (array of interactive controls; include 1–3 meaningful sliders/dropdowns/toggles so readers can explore the figure), and \`"js"\`.
- Each parameter in \`"params"\` must have:
  - \`"name"\`: valid JS/Python identifier (e.g. \`"bins"\`, \`"max_km"\`, \`"metric"\`, \`"show_trend"\`).
  - \`"label"\`: human-readable label.
  - \`"kind"\`: \`"range"\` (slider), \`"select"\` (dropdown), \`"radio"\` (segmented choice), or \`"toggle"\` (boolean switch).
  - \`"min"\`, \`"max"\`, \`"step"\`: numbers (required; for \`select\`/\`radio\`/\`toggle\`, use \`0, 1, 1\`).
  - \`"value"\`: initial value (number for \`range\`, matching item from \`options\` for \`select\`/\`radio\`, boolean for \`toggle\`).
  - \`"unit"\`: optional unit string (e.g. \`"km"\`, \`"%"\`).
  - \`"options"\`: required array of >= 2 values for \`"select"\` or \`"radio"\`.
- In \`"js"\`:
  - The code is the body of an async function with \`Plot\`, \`d3\`, \`data\`, \`width\`, \`expose\`, \`params\`, \`pc\`, \`ket_qua\`, and every parameter name in scope as a variable (never redeclare parameter variables).
  - The code MUST end with \`return Plot.plot({ width, ... })\`, \`return pc.map({ ... })\`, or \`return "<table class=\\"fig-table\\">...</table>"\`.
  - If the document has datasets, use \`data.<dataset_key>\` and exact column names from the dataset list below. If the document has no datasets for the requested topic, or when the user asks to randomize/simulate data ("dữ liệu ngẫu nhiên", "random data"), generate deterministic synthetic data in JS using \`const rng = d3.randomLcg(42)\` with \`d3.randomNormal.source(rng)\` / \`d3.randomExponential.source(rng)\` / \`d3.range(...)\` while keeping existing parameter sliders active.
- When editing an existing figure or a multi-column cell (\`column_group\`) containing multiple figures:
  - Preserve each figure's \`"id"\`, chart dimensions (\`height\`, \`aspectRatio\`), and visual form (\`Plot.plot\` vs \`<table class="fig-table">\` HTML table vs \`pc.map\`) unless explicitly asked to change the chart type.
  - When a multi-column cell contains 2 or more figures, output one \`\`\`papercell-figure\`\`\` JSON block per figure in the exact same order (keeping each figure's \`"id"\`) so Papercell updates each figure inside its original side-by-side column without unwrapping the columns.
- Only include \`"spec"\` if the figure is a standard no-code Design chart without custom parameter filtering; if you write custom \`"js"\` with parameter filtering, omit \`"spec"\` so the custom JS is used directly.

## Creating or editing mathematical formulas (KaTeX & Visual Formula Editor)
- When asked to create, write, or insert a mathematical formula/equation, output a display math block wrapped in \`$$ ... $$\` on its own lines using clean KaTeX syntax.
- Always brace fraction numerators/denominators (\`\\frac{1}{\\mu}\`), superscripts (\`e^{-d/\\mu}\`), subscripts (\`x_{i}\`), and roots (\`\\sqrt{x}\`) so every number, Greek letter (\`\\mu, \\sigma, \\lambda, \\alpha, \\beta\`), variable, and operator (\`\\ge, \\le, \\neq, \\approx\`) becomes an interactive clickable token in Papercell's Visual Formula Editor.
- Use \`\\square\` when leaving a customizable placeholder slot, and \`0{,}6\` or \`0.6\` for decimal numbers. Never use \`\\newcommand\`, \`\\usepackage\`, or \`\\tag\`.
`.trim()

/** Detect whether a user prompt is asking to create or write a mathematical formula/equation. */
export function isEquationPrompt(text: string): boolean {
  return /\b(equation|formula|latex|katex|công\s*thức|biểu\s*thức\s*toán|hệ\s*phương\s*trình|phương\s*trình|phân\s*phối\s*mũ|phân\s*phối\s*chuẩn|hồi\s*quy)\b/i.test(text) && !isFigurePrompt(text)
}

/** Wrap a user instruction so the AI model outputs a clean KaTeX block equation. */
export function wrapEquationPrompt(userInput: string): string {
  const clean = userInput.trim() || 'Write a mathematical formula for this section.'
  return `User request: ${clean}

Write a clean KaTeX block equation wrapped in \`$$ ... $$\`.
Rules:
- Output ONLY the \`$$ ... $$\` block equation (no surrounding commentary unless explicitly requested).
- Always brace \`\\frac{a}{b}\`, superscripts \`x^{n}\`, subscripts \`x_{i}\`, and \`\\sqrt{x}\` so every number, symbol, and variable is directly clickable in Papercell's Visual Formula Editor.`
}

/** Detect whether a user prompt is asking to create/insert a chart, figure, map, or data table. */
export function isFigurePrompt(text: string): boolean {
  return /\b(chart|figure|plot|graph|histogram|scatter|bar\s+chart|line\s+chart|area\s+chart|box\s+plot|heatmap|choropleth|visualize|visualization|biểu\s*đồ|đồ\s*thị|vẽ\s+hình|tạo\s+hình|thêm\s+hình|vẽ\s+bản\s*đồ|bản\s*đồ\s+điểm|bản\s*đồ\s+nhiệt)\b/i.test(text)
}

/** Wrap a user instruction so the AI model outputs a valid papercell-figure JSON block. */
export function wrapFigurePrompt(userInput: string): string {
  const clean = userInput.trim()
  return `${clean ? `User request: ${clean}\n\n` : ''}Create an interactive Papercell figure card for this document using the loaded dataset columns in <context>. Output ONLY a single fenced \`\`\`papercell-figure\`\`\` JSON block with keys "caption", "params" (1–2 interactive controls/sliders), "js" (Observable Plot / D3 code reading data.<dataset> and parameter variables, ending with \`return Plot.plot({ width, ... })\` or \`return pc.map({ ... })\`), and "python".`
}

export function serializeFigureJson(fig: FigureNode): string {
  return JSON.stringify(
    {
      id: fig.id,
      caption: fig.caption,
      ...(fig.label ? { label: fig.label } : {}),
      ...(fig.spec && !fig.specDetached ? { spec: fig.spec } : {}),
      params: fig.params,
      js: fig.js,
      python: fig.python,
    },
    null,
    2
  )
}

/** Collect all FigureNodes inside a block (including inside a column_group's columns). */
export function extractFiguresFromNode(node: any): FigureNode[] {
  const out: FigureNode[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.type === 'figure') {
      out.push(n as FigureNode)
      return
    }
    if (Array.isArray(n.children)) n.children.forEach(walk)
  }
  walk(node)
  return out
}

/** Wrap a user instruction to edit an existing FigureNode in-place. */
export function wrapFigureEditPrompt(fig: FigureNode, userInput: string): string {
  const clean =
    userInput.trim() ||
    'Improve this figure card, its visual styling, interactive controls, and Python verification code.'
  return `Current Papercell figure card JSON:
\`\`\`papercell-figure
${serializeFigureJson(fig)}
\`\`\`

User instruction to modify this figure:
${clean}

Rules:
- Output ONLY a single updated \`\`\`papercell-figure\`\`\` JSON block with "id", "caption", "params", "js", and "python".
- Preserve the figure's "id" ("${fig.id}"), dimensions, and visual kind (Plot.plot vs <table class="fig-table"> vs pc.map) unless the instruction explicitly asks to change the chart type.
- If the instruction asks for random/simulated data ("ngẫu nhiên", "random"), generate deterministic seeded random data inside "js" (\`const rng = d3.randomLcg(42)\`) and "python" (\`rng = np.random.default_rng(42)\`) while keeping the interactive "params" controls functional and omitting "spec".`
}

/** Wrap a user instruction to edit a multi-column cell (column_group) containing figures and/or text. */
export function wrapColumnGroupEditPrompt(groupNode: any, userInput: string): string {
  const clean =
    userInput.trim() ||
    'Improve the content and figures inside this multi-column cell while preserving its column layout.'
  const columns = Array.isArray(groupNode.children) ? groupNode.children : []
  const colDescriptions = columns.map((col: any, idx: number) => {
    const width = col.width || `${Math.round(100 / Math.max(1, columns.length))}%`
    const itemLines = (col.children || []).map((child: any) => {
      if (child.type === 'figure') {
        return `\`\`\`papercell-figure\n${serializeFigureJson(child as FigureNode)}\n\`\`\``
      }
      const txt = (child.children || []).map((c: any) => c.text || '').join('')
      return txt
    })
    return `### Column ${idx + 1} (width: ${width})\n${itemLines.join('\n\n')}`
  })

  const figs = extractFiguresFromNode(groupNode)
  return `Target multi-column cell (${columns.length} side-by-side columns, containing ${figs.length} figure(s)):

${colDescriptions.join('\n\n')}

User instruction for this multi-column cell:
${clean}

Rules:
- This cell is a side-by-side multi-column layout. Do NOT merge the figures or change a table into a chart unless asked.
- Output ONLY ${figs.length} updated \`\`\`papercell-figure\`\`\` JSON block(s) in the exact same order (preserving each figure's "id": ${figs.map((f) => `"${f.id}"`).join(', ')}) so each figure stays inside its original column at its original width.
- Preserve each figure's visual form (e.g. if a figure returns \`<table class="fig-table">\`, keep it as an HTML table; if it returns \`Plot.plot\`, keep its chart type and height).
- If the instruction asks to change data inside to random/simulated ("ngẫu nhiên", "random"), replace \`data.<dataset>\` inside each figure's "js" with deterministic seeded random data (\`const rng = d3.randomLcg(42)\`) and matching "python" (\`rng = np.random.default_rng(42)\`), keeping existing parameter sliders ("params") wired into the calculation and omitting "spec".`
}

/** Merge AI-updated FigureNodes/blocks back into an original column_group so column widths & layout are preserved. */
export function mergeUpdatedNodesIntoColumnGroup(origGroup: any, aiNodes: any[]): any {
  const newFigs = aiNodes.filter((n) => n && n.type === 'figure') as FigureNode[]
  const newTextBlocks = aiNodes.filter((n) => n && n.type !== 'figure')
  const usedFigIndices = new Set<number>()
  let sequentialFigIdx = 0

  const findMatchingFig = (origFig: FigureNode): FigureNode | null => {
    const byIdIdx = newFigs.findIndex((f, i) => !usedFigIndices.has(i) && f.id === origFig.id)
    if (byIdIdx !== -1) {
      usedFigIndices.add(byIdIdx)
      return newFigs[byIdIdx]
    }
    while (sequentialFigIdx < newFigs.length && usedFigIndices.has(sequentialFigIdx)) {
      sequentialFigIdx++
    }
    if (sequentialFigIdx < newFigs.length) {
      usedFigIndices.add(sequentialFigIdx)
      return newFigs[sequentialFigIdx++]
    }
    return null
  }

  let textReplaced = false
  const nextColumns = (origGroup.children || []).map((col: any) => {
    const nextChildren: any[] = []
    for (const child of col.children || []) {
      if (child.type === 'figure') {
        const origFig = child as FigureNode
        const matched = findMatchingFig(origFig)
        if (matched) {
          nextChildren.push({
            ...matched,
            id: origFig.id,
            display: origFig.display,
            codeAccess: origFig.codeAccess,
            padding: origFig.padding,
            python: matched.python?.trim() ? matched.python : origFig.python,
            children: [{ text: '' }],
          })
        } else {
          nextChildren.push(child)
        }
      } else if (newFigs.length === 0 && newTextBlocks.length > 0 && !textReplaced) {
        nextChildren.push(...newTextBlocks)
        textReplaced = true
      } else if (newFigs.length > 0 || !textReplaced) {
        nextChildren.push(child)
      }
    }
    return {
      ...col,
      children: nextChildren.length > 0 ? nextChildren : col.children,
    }
  })

  return {
    ...origGroup,
    children: nextColumns,
  }
}

/** Tóm tắt toàn bộ bảng dữ liệu đang có trong bài để gửi cho AI. */
export function describeDocData(files: DataFile[], data: Dataset): string {
  if (!files.length) return 'Datasets in this document: (none loaded yet — generate deterministic sample data in JS if a figure is requested).'
  const labels = labelsOf(files)
  const lines: string[] = ['Datasets in this document (access via `data.<key>` in JS or `data["<key>"]` in Python):']
  for (const f of files) {
    const key = dataKey(f.name)
    const raw = data[key]
    const rows = asRows(raw)
    if (!rows.length) {
      lines.push(`- ${key} (from ${f.name}): empty or non-tabular JSON`)
      continue
    }
    const cols = describeColumns(rows)
    const shown = (c: Column) => (labels[key]?.[c.name] ? ` [display label: "${labels[key][c.name]}"]` : '')
    const colDesc = cols.map((c) => {
      const vals = rows.map((r) => r[c.name]).filter((v) => v !== null && v !== undefined && v !== '')
      if (c.type === 'number' || c.type === 'lat' || c.type === 'lon') {
        const nums = vals as number[]
        return `  - ${c.name} (${c.type})${shown(c)}: min ${d3.min(nums)}, max ${d3.max(nums)}, mean ${d3.mean(nums)?.toFixed(2)}`
      }
      if (c.type === 'date') {
        const [a, b] = d3.extent(vals as Date[])
        return `  - ${c.name} (date)${shown(c)}: ${a?.toISOString().slice(0, 10)} → ${b?.toISOString().slice(0, 10)}`
      }
      const top = d3.rollups(vals, (v) => v.length, String).sort((a, b) => b[1] - a[1])
      return `  - ${c.name} (text, ${c.distinct} distinct)${shown(c)}: ${top.slice(0, 8).map(([k, n]) => `"${k}" ×${n}`).join(', ')}${top.length > 8 ? ', …' : ''}`
    })
    lines.push(`- ${key} (file "${f.name}", ${rows.length} rows):\n${colDesc.join('\n')}`)
  }
  return lines.join('\n')
}

/** Nội dung bài dạng Markdown kèm thông tin thẻ hình, dữ liệu và hướng dẫn tạo FigureNode cho AI. */
export function docAsContextMarkdown(editor: PlateEditor, files: DataFile[] = [], data: Dataset = {}) {
  const parts: string[] = []
  const text = (n: any): string => (typeof n.text === 'string' ? n.text : (n.children ?? []).map(text).join(''))
  for (const node of editor.children as any[]) {
    if (node.type === 'figure') {
      const paramSummary = Array.isArray(node.params) && node.params.length
        ? `\nParameters: ${JSON.stringify(node.params)}`
        : ''
      parts.push(`[Figure id="${node.id}": ${node.caption || 'no caption'}]${paramSummary}\n\`\`\`js\n${node.js}\n\`\`\``)
      continue
    }
    if (node.type === 'equation' && typeof node.texExpression === 'string') {
      parts.push(`$$\n${node.texExpression}\n$$`)
      continue
    }
    try { parts.push((editor.api as any).markdown.serialize({ value: [node] })) }
    catch { parts.push(text(node)) }
  }
  const dataSection = describeDocData(files, data)
  return `${parts.join('\n\n')}\n\n---\n\n${dataSection}\n\n---\n\n${FIGURE_PROMPT_GUIDE}\n\n### JS Figure Reference\n${skillJs}\n\n### Python Figure Reference\n${skillPy}\n\n### Math Formula Reference\n${skillMath}`
}

const VALID_ID = /^[A-Za-z_]\w*$/
const VALID_KINDS = new Set<ParamKind>(['range', 'select', 'radio', 'toggle'])
const VALID_CHART_TYPES = new Set<string>(CHART_TYPES.map((t) => t.type))

function normalizeParam(raw: any, index: number): FigureParam | null {
  if (!raw || typeof raw !== 'object') return null
  const rawName = String(raw.name ?? `param_${index + 1}`).trim().replace(/[^\w]/g, '_')
  const name = VALID_ID.test(rawName) ? rawName : `p_${rawName || index + 1}`
  const label = String(raw.label ?? name).trim() || name
  const kind: ParamKind = VALID_KINDS.has(raw.kind) ? raw.kind : Array.isArray(raw.options) && raw.options.length >= 2 ? 'select' : typeof raw.value === 'boolean' ? 'toggle' : 'range'

  if (kind === 'toggle') {
    return { name, label, kind: 'toggle', min: 0, max: 1, step: 1, value: Boolean(raw.value) }
  }
  if (kind === 'select' || kind === 'radio') {
    const options: ParamValue[] = Array.isArray(raw.options)
      ? raw.options.filter((v: unknown) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      : []
    if (options.length < 2) return null
    const value = options.includes(raw.value) ? raw.value : options[0]
    return { name, label, kind, min: 0, max: 1, step: 1, value, options }
  }
  const min = Number.isFinite(Number(raw.min)) ? Number(raw.min) : 0
  const max = Number.isFinite(Number(raw.max)) && Number(raw.max) > min ? Number(raw.max) : min + 100
  const step = Number.isFinite(Number(raw.step)) && Number(raw.step) > 0 ? Number(raw.step) : (max - min) / 20
  const valNum = Number(raw.value)
  const value = Number.isFinite(valNum) ? Math.min(max, Math.max(min, valNum)) : min
  const unit = typeof raw.unit === 'string' && raw.unit.trim() ? raw.unit.trim() : undefined
  return { name, label, kind: 'range', min, max, step, value, ...(unit ? { unit } : {}) }
}

function normalizeSpec(raw: any): ChartSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const chartType = typeof raw.type === 'string' ? raw.type : typeof raw.chart === 'string' ? raw.chart : ''
  if (!VALID_CHART_TYPES.has(chartType)) return undefined
  const dataSource = typeof raw.data === 'string' ? raw.data : typeof raw.source === 'string' ? raw.source : ''
  const base = defaultSpec(dataSource)
  return {
    ...base,
    type: chartType as ChartType,
    ...(typeof raw.x === 'string' ? { x: raw.x } : {}),
    ...(typeof raw.y === 'string' ? { y: raw.y } : {}),
    ...(typeof raw.color === 'string' ? { color: raw.color } : {}),
    ...(typeof raw.size === 'string' ? { size: raw.size } : {}),
    ...(typeof raw.facet === 'string' ? { facet: raw.facet } : {}),
    ...(typeof raw.lat === 'string' ? { lat: raw.lat } : {}),
    ...(typeof raw.lon === 'string' ? { lon: raw.lon } : {}),
    ...(typeof raw.agg === 'string' ? { agg: raw.agg as any } : {}),
    ...(Number.isFinite(Number(raw.bins)) ? { bins: Number(raw.bins) } : {}),
    ...(typeof raw.sort === 'string' ? { sort: raw.sort as any } : {}),
    ...(typeof raw.xLabel === 'string' ? { xLabel: raw.xLabel } : {}),
    ...(typeof raw.yLabel === 'string' ? { yLabel: raw.yLabel } : {}),
    ...(typeof raw.scheme === 'string' ? { scheme: raw.scheme } : {}),
    ...(typeof raw.basemap === 'string' ? { basemap: raw.basemap as any } : {}),
  }
}

/** Escape literal unescaped newlines inside JSON string literals and remove trailing commas. */
function repairJsonString(raw: string): string {
  let out = ''
  let inStr = false
  let esc = false
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (inStr) {
      if (esc) {
        esc = false
        out += ch
      } else if (ch === '\\') {
        esc = true
        out += ch
      } else if (ch === '"') {
        inStr = false
        out += ch
      } else if (ch === '\n') {
        out += '\\n'
      } else if (ch === '\r') {
        // skip CR inside string
      } else if (ch === '\t') {
        out += '\\t'
      } else {
        out += ch
      }
    } else {
      if (ch === '"') inStr = true
      out += ch
    }
  }
  return out.replace(/,\s*([}\]])/g, '$1')
}

/** Ensure JS figure code returns the Plot.plot(...) or pc.map(...) DOM node. */
function ensureFigureReturn(code: string): string {
  const trimmed = code.trim()
  if (/\breturn\b/.test(trimmed)) return trimmed
  if (/(^|\n)\s*(Plot\.plot\s*\(|pc\.map\s*\()/.test(trimmed)) {
    return trimmed.replace(/(^|\n)(\s*)(Plot\.plot\s*\(|pc\.map\s*\()/, '$1$2return $3')
  }
  return trimmed
}

export function parseFigureJson(text: string): FigureNode | null {
  const trimmed = text.trim()
  let obj: any
  try {
    obj = JSON.parse(trimmed)
  } catch {
    try {
      obj = JSON.parse(repairJsonString(trimmed))
    } catch {
      return null
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const spec = normalizeSpec(obj.spec)
  const hasJs = typeof obj.js === 'string' && obj.js.trim().length > 0
  if (!hasJs && !spec) return null

  const rawParams = Array.isArray(obj.params)
    ? obj.params
    : obj.params && typeof obj.params === 'object'
      ? Object.entries(obj.params).map(([name, val]: [string, any]) =>
          val && typeof val === 'object' ? { name, ...val } : { name, value: val }
        )
      : []
  const seen = new Set<string>()
  const params: FigureParam[] = []
  for (let i = 0; i < rawParams.length; i++) {
    const p = normalizeParam(rawParams[i], i)
    if (p && !seen.has(p.name)) {
      seen.add(p.name)
      params.push(p)
    }
  }
  if (spec && !params.length) {
    for (const p of specParams(spec)) {
      if (!seen.has(p.name)) { seen.add(p.name); params.push(p) }
    }
  }

  const generatedJs = spec ? codegen(spec) : ''
  const js = hasJs ? ensureFigureReturn(String(obj.js)) : generatedJs
  const specDetached = !!(spec && hasJs && js.trim() !== generatedJs.trim())
  const python = typeof obj.python === 'string' ? obj.python.trim() : ''
  const caption = typeof obj.caption === 'string' ? obj.caption.trim() : ''
  const display = obj.display === 'both' || obj.display === 'code' || obj.display === 'hidden' ? obj.display : 'output'
  const codeAccess = obj.codeAccess === 'none' || obj.codeAccess === 'js' || obj.codeAccess === 'python' ? obj.codeAccess : 'both'

  return {
    type: 'figure',
    id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : newId(),
    caption,
    js,
    python,
    params,
    ...(spec && !specDetached ? { spec } : spec ? { spec, specDetached: true } : {}),
    display,
    codeAccess,
    children: [{ text: '' }],
  }
}

function isFigureJsCode(code: string): boolean {
  return /\bPlot\.plot\s*\(|\bpc\.map\s*\(|<table\s+class=["']fig-table/.test(code)
}

export type ContentSegment =
  | { type: 'md'; text: string }
  | { type: 'figure'; node: FigureNode }

/** Tách chuỗi Markdown của AI thành các đoạn văn bản thường và các thẻ FigureNode (nếu có). */
export function extractFigureSegments(md: string): { segments: ContentSegment[]; figures: FigureNode[] } {
  const fenceRegex = /```([a-zA-Z0-9_-]*)\s*\n([\s\S]*?)```/g
  const segments: ContentSegment[] = []
  const figures: FigureNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fenceRegex.exec(md)) !== null) {
    const lang = (match[1] || '').toLowerCase()
    const body = match[2]
    let fig: FigureNode | null = null

    if (lang === 'papercell-figure' || lang === 'figure' || lang === 'json' || lang === '') {
      fig = parseFigureJson(body)
    }
    if (!fig && (lang === 'js' || lang === 'javascript' || lang === '') && isFigureJsCode(body)) {
      fig = {
        type: 'figure',
        id: newId(),
        caption: '',
        js: ensureFigureReturn(body),
        python: '',
        params: [],
        display: 'output',
        codeAccess: 'both',
        children: [{ text: '' }],
      }
    }

    if (fig) {
      const before = md.slice(lastIndex, match.index).trim()
      if (before) segments.push({ type: 'md', text: before })
      segments.push({ type: 'figure', node: fig })
      figures.push(fig)
      lastIndex = match.index + match[0].length
    }
  }

  // Fallback when AI outputs a bare JSON figure object or bare JS Plot.plot code without markdown fences
  if (!figures.length) {
    const trimmed = md.trim()
    const firstBrace = trimmed.indexOf('{')
    const lastBrace = trimmed.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = trimmed.slice(firstBrace, lastBrace + 1)
      const fig = parseFigureJson(jsonCandidate)
      if (fig) {
        const before = trimmed.slice(0, firstBrace).trim()
        const after = trimmed.slice(lastBrace + 1).trim()
        if (before) segments.push({ type: 'md', text: before })
        segments.push({ type: 'figure', node: fig })
        figures.push(fig)
        if (after) segments.push({ type: 'md', text: after })
        return { segments, figures }
      }
    }
    if (isFigureJsCode(trimmed)) {
      const fig: FigureNode = {
        type: 'figure',
        id: newId(),
        caption: '',
        js: ensureFigureReturn(trimmed),
        python: '',
        params: [],
        display: 'output',
        codeAccess: 'both',
        children: [{ text: '' }],
      }
      return { segments: [{ type: 'figure', node: fig }], figures: [fig] }
    }
  }

  const tail = md.slice(lastIndex).trim()
  if (tail) segments.push({ type: 'md', text: tail })
  if (!segments.length && md.trim()) segments.push({ type: 'md', text: md })
  return { segments, figures }
}

/** Chuyển chuỗi Markdown (có thể chứa khối papercell-figure hoặc công thức $$...$$) thành mảng node Plate. */
export function deserializeMarkdownWithFigures(editor: PlateEditor, md: string): any[] {
  const { segments } = extractFigureSegments(md)
  const out: any[] = []
  for (const seg of segments) {
    if (seg.type === 'figure') {
      out.push({ ...seg.node, id: seg.node.id || newId(), children: [{ text: '' }] })
    } else {
      const normalized = normalizeMath(seg.text)
      const displayMathRegex = /\$\$([\s\S]+?)\$\$/g
      let lastIdx = 0
      let m: RegExpExecArray | null
      while ((m = displayMathRegex.exec(normalized)) !== null) {
        const proseBefore = normalized.slice(lastIdx, m.index).trim()
        if (proseBefore) {
          const nodes = (editor.api as any).markdown.deserialize(proseBefore)
          if (Array.isArray(nodes)) out.push(...nodes)
        }
        const texExpression = m[1].trim()
        if (texExpression) {
          out.push({
            type: 'equation',
            id: `eq-${newId()}`,
            texExpression,
            children: [{ text: '' }],
          })
        }
        lastIdx = m.index + m[0].length
      }
      const proseAfter = normalized.slice(lastIdx).trim()
      if (proseAfter) {
        const nodes = (editor.api as any).markdown.deserialize(proseAfter)
        if (Array.isArray(nodes)) out.push(...nodes)
      }
    }
  }
  return out
}
