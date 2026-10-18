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
const dur = (s: number) => (s < 60 ? `${Math.round(s)} giây` : s < 3600 ? `${Math.floor(s / 60)} phút ${Math.round(s % 60)} giây` : `${(s / 3600).toFixed(1)} giờ`)

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
      .catch(() => { setPy({ available: false, error: 'Không gọi được server Papercell (bản trên máy).' }); setEngine('pyodide') })
  }, [])
  useEffect(() => {
    if (!cache) { setStale(false); return }
    fingerprint(fig, files, cache.grid).then((f) => setStale(f !== cache.fingerprint))
  }, [cache, fig.python, files]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!prog) return; const t = setInterval(() => tick((x) => x + 1), 500); return () => clearInterval(t) }, [prog])

  const run = async () => {
    if (!fig.python.trim()) { setMsg('Chưa có code Python gốc. Mở tab "Python gốc" để dán code, và gán kết quả vào biến ket_qua.'); return }
    if (total > MAX_COMBOS) { setMsg(`Lưới có ${total.toLocaleString('vi-VN')} tổ hợp, quá giới hạn ${MAX_COMBOS.toLocaleString('vi-VN')}. Tăng bước tính để giảm số tổ hợp.`); return }
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
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Lỗi ${res.status}`)
        let fatal = ''
        await readJsonLines(res, (o) => { if (o.fatal) fatal = o.fatal; else if ('i' in o) onItem(o) })
        if (fatal) throw new Error(fatal)
      } else {
        await kernel.runGrid(fig.python, combos, payloadFiles, onItem)
      }
      if (p.done < total) throw new Error('Đã dừng giữa chừng.')
      if (p.failed === total) throw new Error('Mọi tổ hợp đều lỗi: ' + (p.firstError ?? ''))
      const { payload, bytes } = await encodeResults(results)
      const out: ScenarioCache = {
        grid, payload, bytes, count: total, failed: p.failed, engine,
        fingerprint: await fingerprint(fig, files, grid), at: new Date().toISOString(), seconds: (Date.now() - p.started) / 1000,
      }
      onUpdate({ scenarios: out })
    } catch (e) {
      setMsg((e as Error).name === 'AbortError' || (e as Error).message === 'Đã dừng.' ? 'Đã dừng. Kết quả cũ (nếu có) vẫn giữ nguyên.' : (e as Error).message)
    } finally { setProg(null); abort.current = null }
  }
  const stop = () => { abort.current?.abort(); if (engine === 'pyodide') kernel.cancel() }

  const elapsed = prog ? (Date.now() - prog.started) / 1000 : 0
  const eta = prog && prog.done > 0 ? (elapsed / prog.done) * (prog.total - prog.done) : 0

  return (
    <div className="dlg-scen">
      <p>Chạy <b>code Python gốc</b> cho <b>mọi tổ hợp tham số</b> một lần, ngay trên máy bạn. Kết quả (biến <code>ket_qua</code>) được nén vào bài. Khi xuất bản, người đọc kéo thanh trượt là app tra kết quả đã tính sẵn: <b>không cần Python, không cần server</b>.</p>
      <p className="hint">Trong code JS, đọc kết quả bằng biến <code>ket_qua</code>. Nếu chưa tính sẵn, biến này là <code>undefined</code>.</p>

      <section>
        <h3>Lưới tham số</h3>
        {fig.params.length ? (
          <table>
            <thead><tr><th>Tham số</th><th>Từ</th><th>Đến</th><th>Bước tính sẵn</th><th>Số giá trị</th></tr></thead>
            <tbody>
              {fig.params.map((p, k) => (
                <tr key={p.name}>
                  <td>{p.label} <code>{p.name}</code></td><td>{p.min}</td><td>{p.max}</td>
                  <td><input type="number" step="any" min={p.step} value={steps[p.name]} disabled={!!prog} aria-label={'Bước tính sẵn của ' + p.label}
                    onChange={(e) => setSteps({ ...steps, [p.name]: +e.target.value })} /></td>
                  <td className="num">{grid[k].values.length.toLocaleString('vi-VN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="hint">Hình này chưa có tham số: Python sẽ chạy đúng 1 lần. Thêm tham số ở tab "Tham số" để có thanh trượt.</p>}
        <div className={'scen-total' + (total > WARN_COMBOS ? ' warn' : '')}>
          Tổng cộng <b>{total.toLocaleString('vi-VN')}</b> tổ hợp{fig.params.length > 1 ? ` (= ${grid.map((g) => g.values.length).join(' × ')})` : ''}.
          {total > WARN_COMBOS && ' Lưới khá lớn: có thể mất nhiều thời gian và làm file nặng. Tăng bước tính để giảm.'}
          {cache && cache.count > 0 && ` Lần trước mất khoảng ${dur((cache.seconds / cache.count) * total)} cho lưới này.`}
        </div>
      </section>

      <section>
        <h3>Chạy bằng</h3>
        <div className="choice-grid">
          <button className={'choice' + (engine === 'local' ? ' on' : '')} disabled={!py?.available || !!prog} onClick={() => setEngine('local')} aria-pressed={engine === 'local'}>
            <Cpu size={18} /><span><b>Python trên máy</b><br /><small>{py === null ? 'Đang dò…' : py.available ? `Python ${py.version} · pandas ${py.pandas} · nhanh, dùng mọi thư viện đã cài` : py.error}</small></span>
          </button>
          <button className={'choice' + (engine === 'pyodide' ? ' on' : '')} disabled={!!prog} onClick={() => setEngine('pyodide')} aria-pressed={engine === 'pyodide'}>
            <Globe size={18} /><span><b>Python trong trình duyệt</b><br /><small>Pyodide · chạy ở mọi nơi, chậm hơn, chỉ có thư viện phổ biến</small></span>
          </button>
        </div>
      </section>

      <div className="row">
        {prog
          ? <button className="btn" onClick={stop}><Square size={14} />Dừng</button>
          : <button className="btn primary" onClick={run}><Play size={14} />{cache ? 'Chạy lại' : 'Chạy'} {total.toLocaleString('vi-VN')} tổ hợp</button>}
        {cache && !prog && <button className="btn" onClick={() => onUpdate({ scenarios: undefined })}><Trash2 size={14} />Xóa kết quả tính sẵn</button>}
      </div>

      {prog && (
        <div className="scen-progress" role="status" aria-live="polite">
          <div className="bar"><i style={{ width: `${(100 * prog.done) / prog.total}%` }} /></div>
          <div className="row">
            <Loader2 size={14} className="spin" />
            <span><b>{prog.done.toLocaleString('vi-VN')}</b> / {prog.total.toLocaleString('vi-VN')} tổ hợp</span>
            <span className="hint">đã chạy {dur(elapsed)}{prog.done > 0 ? ` · còn khoảng ${dur(eta)}` : ''}</span>
            {prog.failed > 0 && <span className="pc-err">{prog.failed} lỗi</span>}
          </div>
        </div>
      )}
      {msg && <p className="pc-err">{msg}</p>}

      {cache && !prog && (
        <div className={'verify-box ' + (stale ? 'bad' : 'ok')}>
          {stale ? <TriangleAlert size={18} /> : <CircleCheck size={18} />}
          <div>
            <b>{stale ? 'Kết quả tính sẵn đã cũ' : 'Đã tính sẵn'}</b>
            <p>{cache.count.toLocaleString('vi-VN')} tổ hợp{cache.failed ? ` (${cache.failed} lỗi)` : ''} · nén còn {formatBytes(cache.bytes)} · {cache.engine === 'local' ? 'Python trên máy' : 'Pyodide'} · mất {dur(cache.seconds)}</p>
            {stale && <p>Code Python, dữ liệu hoặc lưới đã đổi sau lần tính trước. Bấm "Chạy lại" để cập nhật.</p>}
            <small>Lần chạy: {new Date(cache.at).toLocaleString('vi-VN')} · dấu vân tay {cache.fingerprint}</small>
          </div>
        </div>
      )}
      {prog === null && msg === '' && cache?.failed ? <p className="hint">Tổ hợp lỗi sẽ không có kết quả (ket_qua = null).</p> : null}
    </div>
  )
}

/** Bước của một dãy giá trị đều nhau. */
function stepOf(values: number[], fallback: number) {
  return values.length > 1 ? +(values[1] - values[0]).toFixed(10) : fallback
}
