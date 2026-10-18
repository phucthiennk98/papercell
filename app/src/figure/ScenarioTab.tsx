import { useContext, useEffect, useRef, useState } from 'react'
import { CircleCheck, Cpu, Globe, Loader2, Play, Square, Trash2, TriangleAlert } from 'lucide-react'
import { kernel } from '@/python/kernel'
import type { FigureNode } from '@/editor/types'
import { DataContext, dataKey } from './runtime'
import { axisValues, comboAt, comboCount, encodeResults, fingerprint, formatBytes, type GridAxis, type ScenarioCache } from './scenarios'

type Engine = 'local' | 'pyodide'
type PyInfo = { available: boolean; version?: string; pandas?: string; error?: string }
type Progress = { done: number; total: number; failed: number; firstError?: string; started: number }

const WARN_COMBOS = 2000
const MAX_COMBOS = 50000
const dur = (s: number) => (s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${(s / 3600).toFixed(1)} h`)

/** Đọc luồng JSONL (mỗi dòng một đối tượng) từ server. */
async function readJsonLines(res: Response, onLine: (o: any) => void) {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read(); if (done) break
    buf += value
    let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onLine(JSON.parse(line)) }
  }
  if (buf.trim()) onLine(JSON.parse(buf))
}

export function ScenarioTab({ fig, onUpdate }: { fig: FigureNode; onUpdate: (p: Partial<FigureNode>) => void }) {
  const { files } = useContext(DataContext)
  const [steps, setSteps] = useState<Record<string, number>>(() => Object.fromEntries(fig.params.map((p) => [p.name, fig.scenarios?.grid.find((g) => g.name === p.name) ? stepOf(fig.scenarios.grid.find((g) => g.name === p.name)!.values, p.step) : p.step])))
  const [py, setPy] = useState<PyInfo | null>(null)
  const [engine, setEngine] = useState<Engine>('local')
  const [prog, setProg] = useState<Progress | null>(null)
  const [stale, setStale] = useState(false)
  const [msg, setMsg] = useState('')
  const abort = useRef<AbortController | null>(null)
  const [, tick] = useState(0)

  const grid: GridAxis[] = fig.params.map((p) => ({ name: p.name, values: axisValues(p, steps[p.name] > 0 ? steps[p.name] : p.step) }))
  const total = comboCount(grid)
  const cache = fig.scenarios

  useEffect(() => {
    // Lần dò đầu có thể chậm (khởi động Python + pandas): thử lại một lần trước khi báo lỗi.
    const detect = (): Promise<PyInfo> => fetch('/api/python').then((r) => r.json())
    detect().catch(() => new Promise((ok) => setTimeout(ok, 1500)).then(detect))
      .then((j) => { setPy(j); if (!j.available) setEngine('pyodide') })
      .catch(() => { setPy({ available: false, error: 'Could not reach the local Papercell server.' }); setEngine('pyodide') })
  }, [])
  useEffect(() => {
    if (!cache) { setStale(false); return }
    fingerprint(fig, files, cache.grid).then((f) => setStale(f !== cache.fingerprint))
  }, [cache, fig.python, files]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!prog) return; const t = setInterval(() => tick((x) => x + 1), 500); return () => clearInterval(t) }, [prog])

  const run = async () => {
    if (!fig.python.trim()) { setMsg('No original Python code yet. Open the "Original Python" tab, paste your code and assign the result to ket_qua.'); return }
    if (total > MAX_COMBOS) { setMsg(`The grid has ${total.toLocaleString('en-US')} combinations, over the ${MAX_COMBOS.toLocaleString('en-US')} limit. Increase the steps to reduce it.`); return }
    setMsg('')
    const combos = Array.from({ length: total }, (_, i) => comboAt(grid, i))
    const payloadFiles = files.map((f) => ({ key: dataKey(f.name), kind: f.kind, content: f.content }))
    const results: unknown[] = new Array(total).fill(null)
    const p: Progress = { done: 0, total, failed: 0, started: Date.now() }
    setProg({ ...p })
    const onItem = (it: { i: number; ok: boolean; value?: unknown; error?: string }) => {
      p.done++
      if (it.ok) results[it.i] = it.value ?? null
      else { p.failed++; p.firstError ??= it.error }
      if (p.done % 5 === 0 || p.done === total) setProg({ ...p })
    }
    try {
      if (engine === 'local') {
        const ctl = new AbortController(); abort.current = ctl
        const res = await fetch('/api/python/grid', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal, body: JSON.stringify({ code: fig.python, files: payloadFiles, combos }) })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`)
        let fatal = ''
        await readJsonLines(res, (o) => { if (o.fatal) fatal = o.fatal; else if ('i' in o) onItem(o) })
        if (fatal) throw new Error(fatal)
      } else {
        await kernel.runGrid(fig.python, combos, payloadFiles, onItem)
      }
      if (p.done < total) throw new Error('Stopped before finishing.')
      if (p.failed === total) throw new Error('Every combination failed: ' + (p.firstError ?? ''))
      const { payload, bytes } = await encodeResults(results)
      const out: ScenarioCache = {
        grid, payload, bytes, count: total, failed: p.failed, engine,
        fingerprint: await fingerprint(fig, files, grid), at: new Date().toISOString(), seconds: (Date.now() - p.started) / 1000,
      }
      onUpdate({ scenarios: out })
    } catch (e) {
      setMsg((e as Error).name === 'AbortError' || (e as Error).message === 'Stopped.' ? 'Stopped. Previous results (if any) are kept.' : (e as Error).message)
    } finally { setProg(null); abort.current = null }
  }
  const stop = () => { abort.current?.abort(); if (engine === 'pyodide') kernel.cancel() }

  const elapsed = prog ? (Date.now() - prog.started) / 1000 : 0
  const eta = prog && prog.done > 0 ? (elapsed / prog.done) * (prog.total - prog.done) : 0

  return (
    <div className="dlg-scen">
      <p>Run the <b>original Python code</b> once for <b>every parameter combination</b>, on your computer. The results (variable <code>ket_qua</code>) are compressed into the document. When published, moving a slider looks up the precomputed result: <b>no Python, no server</b>.</p>
      <p className="hint">In the JS code, read the result from <code>ket_qua</code>. It is <code>undefined</code> until precomputed.</p>

      <section>
        <h3>Parameter grid</h3>
        {fig.params.length ? (
          <table>
            <thead><tr><th>Parameter</th><th>From</th><th>To</th><th>Step</th><th>Values</th></tr></thead>
            <tbody>
              {fig.params.map((p, k) => (
                <tr key={p.name}>
                  <td>{p.label} <code>{p.name}</code></td><td>{p.min}</td><td>{p.max}</td>
                  <td><input type="number" step="any" min={p.step} value={steps[p.name]} disabled={!!prog} aria-label={'Precompute step for ' + p.label}
                    onChange={(e) => setSteps({ ...steps, [p.name]: +e.target.value })} /></td>
                  <td className="num">{grid[k].values.length.toLocaleString('vi-VN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="hint">This figure has no parameters: Python runs once. Add parameters in the "Parameters" tab to get sliders.</p>}
        <div className={'scen-total' + (total > WARN_COMBOS ? ' warn' : '')}>
          Total <b>{total.toLocaleString('en-US')}</b> combinations{fig.params.length > 1 ? ` (= ${grid.map((g) => g.values.length).join(' × ')})` : ''}.
          {total > WARN_COMBOS && ' Large grid: it may take a while and make the file heavy. Increase the steps to reduce it.'}
          {cache && cache.count > 0 && ` Estimated about ${dur((cache.seconds / cache.count) * total)} based on the last run.`}
        </div>
      </section>

      <section>
        <h3>Run with</h3>
        <div className="choice-grid">
          <button className={'choice' + (engine === 'local' ? ' on' : '')} disabled={!py?.available || !!prog} onClick={() => setEngine('local')} aria-pressed={engine === 'local'}>
            <Cpu size={18} /><span><b>Local Python</b><br /><small>{py === null ? 'Detecting…' : py.available ? `Python ${py.version} · pandas ${py.pandas} · fast, any installed library` : py.error}</small></span>
          </button>
          <button className={'choice' + (engine === 'pyodide' ? ' on' : '')} disabled={!!prog} onClick={() => setEngine('pyodide')} aria-pressed={engine === 'pyodide'}>
            <Globe size={18} /><span><b>Python in the browser</b><br /><small>Pyodide · runs anywhere, slower, common libraries only</small></span>
          </button>
        </div>
      </section>

      <div className="row">
        {prog
          ? <button className="btn" onClick={stop}><Square size={14} />Stop</button>
          : <button className="btn primary" onClick={run}><Play size={14} />{cache ? 'Run again' : 'Run'} {total.toLocaleString('en-US')} combinations</button>}
        {cache && !prog && <button className="btn" onClick={() => onUpdate({ scenarios: undefined })}><Trash2 size={14} />Delete precomputed results</button>}
      </div>

      {prog && (
        <div className="scen-progress" role="status" aria-live="polite">
          <div className="bar"><i style={{ width: `${(100 * prog.done) / prog.total}%` }} /></div>
          <div className="row">
            <Loader2 size={14} className="spin" />
            <span><b>{prog.done.toLocaleString('en-US')}</b> / {prog.total.toLocaleString('en-US')} combinations</span>
            <span className="hint">elapsed {dur(elapsed)}{prog.done > 0 ? ` · about ${dur(eta)} left` : ''}</span>
            {prog.failed > 0 && <span className="pc-err">{prog.failed} failed</span>}
          </div>
        </div>
      )}
      {msg && <p className="pc-err">{msg}</p>}

      {cache && !prog && (
        <div className={'verify-box ' + (stale ? 'bad' : 'ok')}>
          {stale ? <TriangleAlert size={18} /> : <CircleCheck size={18} />}
          <div>
            <b>{stale ? 'Precomputed results are out of date' : 'Precomputed'}</b>
            <p>{cache.count.toLocaleString('en-US')} combinations{cache.failed ? ` (${cache.failed} failed)` : ''} · {formatBytes(cache.bytes)} compressed · {cache.engine === 'local' ? 'local Python' : 'Pyodide'} · took {dur(cache.seconds)}</p>
            {stale && <p>The Python code, data or grid changed since the last run. Press "Run again" to update.</p>}
            <small>Run at: {new Date(cache.at).toLocaleString('en-US')} · fingerprint {cache.fingerprint}</small>
          </div>
        </div>
      )}
      {prog === null && msg === '' && cache?.failed ? <p className="hint">Failed combinations have no result (ket_qua = null).</p> : null}
    </div>
  )
}

/** Bước của một dãy giá trị đều nhau. */
function stepOf(values: number[], fallback: number) {
  return values.length > 1 ? +(values[1] - values[0]).toFixed(10) : fallback
}
