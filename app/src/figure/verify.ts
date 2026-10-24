// Compare the original Python result (variable result) with the JS result passed to expose().
import type { DataFile, FigureNode, ParamValue, VerifyResult } from '../editor/types'
import { dataKey, labelsOf, parseData, runFigure } from './runtime'

type Leaf = [path: string, value: unknown]

/** Run verification against the server's underlying Python environment (local or Docker) when available. */
async function runServerVerify(
  code: string,
  params: Record<string, ParamValue>,
  files: { key: string; kind: string; content: string }[],
): Promise<{ value?: unknown; error?: string } | null> {
  try {
    const res = await fetch('/api/python/grid', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, files, combos: [params] }),
    })
    if (!res.ok || !res.body) return null
    const text = await res.text()
    let fatal = ''
    let item: { ok: boolean; value?: unknown; error?: string } | null = null
    for (const raw of text.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      const obj = JSON.parse(line)
      if (obj.fatal) fatal = String(obj.fatal)
      else if ('i' in obj) item = obj
    }
    if (fatal) return { error: fatal }
    if (item) return item.ok ? { value: item.value } : { error: item.error || 'Python execution failed.' }
    return null
  } catch {
    return null
  }
}

/** Flatten a nested value into (path, leaf) pairs with sorted object keys. */
function flatten(v: unknown, path = '', out: Leaf[] = []): Leaf[] {
  if (v instanceof Map) v = Object.fromEntries(v)
  if (v instanceof Date) v = v.toISOString()
  if (Array.isArray(v)) v.forEach((x, i) => flatten(x, `${path}[${i}]`, out))
  else if (v && typeof v === 'object') Object.keys(v as object).sort().forEach((k) => flatten((v as any)[k], path ? `${path}.${k}` : k, out))
  else out.push([path, v])
  return out
}

const close = (a: unknown, b: unknown) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 + 1e-6 * Math.max(Math.abs(a), Math.abs(b))
  return String(a) === String(b)
}

export async function verifyFigure(fig: FigureNode, files: DataFile[]): Promise<VerifyResult> {
  const at = new Date().toISOString()
  if (!fig.python.trim()) return { ok: false, message: 'No original Python code to compare with.', at }
  const js = await runFigure(fig.js, fig.params, parseData(files), 600, undefined, labelsOf(files))
  if (js.error) return { ok: false, message: 'JS code error: ' + js.error, at }
  if (js.exposed === undefined) return { ok: false, message: 'The JS code does not call expose(value) to publish a result to compare.', at }

  const params = Object.fromEntries(fig.params.map((p) => [p.name, p.value]))
  const payloadFiles = files.map((f) => ({ key: dataKey(f.name), kind: f.kind, content: f.content }))
  const py = await runServerVerify(fig.python, params, payloadFiles)
  if (!py) return { ok: false, message: 'Could not reach the local Python server (/api/python). Make sure the Papercell server is running with Python 3.', at }
  if (py.error) return { ok: false, message: 'Python code error: ' + py.error, at }

  const a = flatten(py.value), b = flatten(js.exposed)
  const mapB = new Map(b)
  const missing = a.filter(([p]) => !mapB.has(p)).length
  const extra = b.length - (a.length - missing)
  const wrong = a.filter(([p, v]) => mapB.has(p) && !close(v, mapB.get(p)))
  if (!missing && !extra && !wrong.length) return { ok: true, message: `Match: ${a.length}/${a.length} values (current parameters).`, at }
  const first = wrong[0] ? ` Example ${wrong[0][0] || 'value'}: Python = ${String(wrong[0][1])}, JS = ${String(mapB.get(wrong[0][0]))}.` : ''
  return { ok: false, message: `No match: ${wrong.length} different, ${missing} missing, ${Math.max(0, extra)} extra.${first}`, at }
}
