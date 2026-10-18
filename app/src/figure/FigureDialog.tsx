import { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { ChartColumn, CircleCheck, CircleX, Code, EyeOff, Loader2, Plus, Rows2, Trash2, X, type LucideIcon } from 'lucide-react'
import { kernel } from '../python/kernel'
import { ACCESS_LABEL, DISPLAY_LABEL, type CodeAccess, type FigureDisplay, type FigureNode, type FigureParam } from '../editor/types'
import { visibleCode } from './FigureElement'
import { FigureView, ParamSliders } from './FigureView'
import { DataContext, dataKey } from './runtime'
import { verifyFigure } from './verify'

export type DialogTab = 'figure' | 'js' | 'python' | 'params' | 'verify' | 'settings'

const DISPLAY_ICON: Record<FigureDisplay, LucideIcon> = { output: ChartColumn, both: Rows2, code: Code, hidden: EyeOff }
const IDENT = /^[A-Za-z_$][\w$]*$/

type Props = {
  fig: FigureNode; params: FigureParam[]; number?: number; readOnly: boolean; initialTab: DialogTab
  onParam: (name: string, v: number) => void; onCommitParams: () => void
  onUpdate: (p: Partial<FigureNode>) => void; onClose: () => void
}

export function FigureDialog({ fig, params, number, readOnly, initialTab, onParam, onCommitParams, onUpdate, onClose }: Props) {
  const readTabs: [DialogTab, string][] = [['figure', 'Hình'], ...visibleCode(fig).map((c) => [c.lang === 'JS' ? 'js' : 'python', c.lang === 'JS' ? 'Code JS' : 'Python gốc'] as [DialogTab, string])]
  const editTabs: [DialogTab, string][] = [['figure', 'Hình'], ['js', 'Code JS'], ['python', 'Python gốc'], ['params', 'Tham số'], ['verify', 'Kiểm chứng'], ['settings', 'Cài đặt']]
  const tabs = readOnly ? readTabs : editTabs
  const [tab, setTab] = useState<DialogTab>(tabs.some(([t]) => t === initialTab) ? initialTab : 'figure')
  const dlg = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    dlg.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => { removeEventListener('keydown', onKey); document.body.classList.remove('modal-open'); prev?.focus?.() }
  }, [onClose])

  const title = `${number ? `Hình ${number}. ` : ''}${fig.caption || 'Hình chưa có chú thích'}`

  return createPortal(
    <div className="dlg-backdrop" onMouseDown={onClose}>
      <div ref={dlg} className="dlg" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}>
        <header className="dlg-head">
          <span className="dlg-title">{title}</span>
          <nav className="dlg-tabs" role="tablist">
            {tabs.map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{l}</button>)}
          </nav>
          <button className="pc-icon-btn" aria-label="Đóng" onClick={onClose}><X size={17} /></button>
        </header>
        <div className="dlg-body">
          {tab === 'figure' && (
            <div className="dlg-figure">
              <FigureView js={fig.js} params={params} className="is-large" />
              {params.length > 0 && <aside><ParamSliders params={params} onChange={onParam} onCommit={onCommitParams} idPrefix={'dlg-' + fig.id} large /></aside>}
            </div>
          )}
          {readOnly && (tab === 'js' || tab === 'python') && <pre className="dlg-code">{tab === 'js' ? fig.js : fig.python}</pre>}
          {!readOnly && tab === 'js' && <CodeTab fig={fig} params={params} lang="js" onUpdate={onUpdate} />}
          {!readOnly && tab === 'python' && <CodeTab fig={fig} params={params} lang="python" onUpdate={onUpdate} />}
          {!readOnly && tab === 'params' && <ParamsTab fig={fig} onUpdate={onUpdate} />}
          {!readOnly && tab === 'verify' && <VerifyTab fig={fig} onUpdate={onUpdate} />}
          {!readOnly && tab === 'settings' && <SettingsTab fig={fig} onUpdate={onUpdate} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const HINT = {
  js: 'Có sẵn: Plot, d3, data.<tên_file>, width, expose(giá_trị) và mỗi tham số là một biến. Trả về Plot.plot(...) hoặc chuỗi HTML.',
  python: 'Code gốc của bạn, chỉ dùng để đối chiếu và kiểm chứng. Có sẵn data["<tên_file>"] (DataFrame) và các tham số. Gán kết quả cần so vào biến ket_qua.',
}

function CodeTab({ fig, params, lang, onUpdate }: { fig: FigureNode; params: FigureParam[]; lang: 'js' | 'python'; onUpdate: (p: Partial<FigureNode>) => void }) {
  const [draft, setDraft] = useState(fig[lang])
  const timer = useRef(0)
  const change = (v: string) => {
    setDraft(v)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onUpdate({ [lang]: v } as Partial<FigureNode>), 400)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <div className="dlg-code-edit">
      <div className="dlg-editor">
        <p className="hint">{HINT[lang]}</p>
        <textarea spellCheck={false} value={draft} onChange={(e) => change(e.target.value)} aria-label={lang === 'js' ? 'Code JS' : 'Code Python gốc'}
          placeholder={lang === 'python' ? 'Dán code Python gốc vào đây…' : ''}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault()
              const t = e.currentTarget, s = t.selectionStart
              change(t.value.slice(0, s) + '  ' + t.value.slice(t.selectionEnd))
              requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2 })
            }
          }} />
      </div>
      <div className="dlg-preview">
        <p className="hint">{lang === 'js' ? 'Xem trước (cập nhật khi gõ)' : 'Hình đang vẽ bằng JS'}</p>
        <FigureView js={lang === 'js' ? draft : fig.js} params={params} />
      </div>
    </div>
  )
}

function ParamsTab({ fig, onUpdate }: { fig: FigureNode; onUpdate: (p: Partial<FigureNode>) => void }) {
  const [rows, setRows] = useState(() => fig.params.map((p) => ({ ...p, unit: p.unit ?? '' })))
  const [err, setErr] = useState('')
  const set = (i: number, k: keyof FigureParam, v: string) => { setErr(''); setRows((r) => r.map((p, j) => (j === i ? { ...p, [k]: k === 'name' || k === 'label' || k === 'unit' ? v : (v as unknown as number) } : p))) }
  const save = () => {
    const out: FigureParam[] = []
    for (const r of rows) {
      const min = +r.min, max = +r.max, step = +r.step, value = +r.value
      if (!IDENT.test(r.name)) return setErr(`Tên "${r.name}" không hợp lệ: chỉ gồm chữ không dấu, số, dấu _ và không bắt đầu bằng số.`)
      if (out.some((p) => p.name === r.name)) return setErr(`Tên "${r.name}" bị trùng.`)
      if (!(max > min) || !(step > 0)) return setErr(`Tham số "${r.name}": lớn nhất phải lớn hơn nhỏ nhất và bước phải lớn hơn 0.`)
      out.push({ name: r.name, label: r.label || r.name, min, max, step, value: Math.min(max, Math.max(min, value)), unit: r.unit })
    }
    onUpdate({ params: out }); setErr('Đã lưu.')
  }
  return (
    <div className="dlg-params">
      <p className="hint">Mỗi tham số là một biến dùng được trong cả code JS lẫn Python, và hiện thành thanh trượt trong thẻ hình.</p>
      <table>
        <thead><tr><th>Tên biến</th><th>Nhãn</th><th>Nhỏ nhất</th><th>Lớn nhất</th><th>Bước</th><th>Mặc định</th><th>Đơn vị</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {(['name', 'label', 'min', 'max', 'step', 'value', 'unit'] as (keyof FigureParam)[]).map((k) => (
                <td key={k}><input value={String(r[k] ?? '')} aria-label={k} type={['min', 'max', 'step', 'value'].includes(k) ? 'number' : 'text'} step="any" onChange={(e) => set(i, k, e.target.value)} /></td>
              ))}
              <td><button className="pc-icon-btn" aria-label="Xóa tham số" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button className="btn" onClick={() => setRows([...rows, { name: `tham_so_${rows.length + 1}`, label: 'Tham số mới', min: 0, max: 10, step: 1, value: 5, unit: '' }])}><Plus size={14} /> Thêm tham số</button>
        <button className="btn primary" onClick={save}>Lưu tham số</button>
        {err && <span className={err === 'Đã lưu.' ? 'ok' : 'pc-err'}>{err}</span>}
      </div>
    </div>
  )
}

function VerifyTab({ fig, onUpdate }: { fig: FigureNode; onUpdate: (p: Partial<FigureNode>) => void }) {
  const { files } = useContext(DataContext)
  const status = useSyncExternalStore((l) => kernel.subscribe(l), () => kernel.status)
  const [busy, setBusy] = useState(false)
  const run = async () => { setBusy(true); try { onUpdate({ verify: await verifyFigure(fig, files) }) } finally { setBusy(false) } }
  const v = fig.verify
  return (
    <div className="dlg-verify">
      <p>Kiểm chứng chạy <b>Python gốc</b> và <b>code JS</b> trên cùng dữ liệu, cùng giá trị tham số, rồi so từng con số.</p>
      <ol className="hint">
        <li>Trong Python, gán kết quả cần so vào biến <code>ket_qua</code> (số, list, dict, Series hoặc DataFrame).</li>
        <li>Trong JS, gọi <code>expose(giá_trị)</code> với kết quả tương ứng (số, mảng, đối tượng hoặc Map).</li>
        <li>Dữ liệu có sẵn: {files.length ? files.map((f) => <code key={f.name}>{dataKey(f.name)}</code>).reduce((a, b) => <>{a}, {b}</>) : 'chưa có file nào'}.</li>
      </ol>
      <div className="row">
        <button className="btn primary" onClick={run} disabled={busy}>{busy ? <><Loader2 size={14} className="spin" /> Đang kiểm chứng…</> : 'Chạy kiểm chứng'}</button>
        <span className="hint">Python: {status.text} (lần đầu tải khoảng 10–20 giây)</span>
      </div>
      {v && (
        <div className={'verify-box ' + (v.ok ? 'ok' : 'bad')}>
          {v.ok ? <CircleCheck size={18} /> : <CircleX size={18} />}
          <div><b>{v.ok ? 'Khớp' : 'Chưa khớp'}</b><p>{v.message}</p><small>Lần chạy: {new Date(v.at).toLocaleString('vi-VN')}</small></div>
        </div>
      )}
    </div>
  )
}

function SettingsTab({ fig, onUpdate }: { fig: FigureNode; onUpdate: (p: Partial<FigureNode>) => void }) {
  return (
    <div className="dlg-settings">
      <section>
        <h3>Hiển thị trong bài</h3>
        <div className="choice-grid">
          {(Object.keys(DISPLAY_LABEL) as FigureDisplay[]).map((k) => {
            const Icon = DISPLAY_ICON[k]
            return <button key={k} className={'choice' + (fig.display === k ? ' on' : '')} aria-pressed={fig.display === k} onClick={() => onUpdate({ display: k })}><Icon size={18} /><span>{DISPLAY_LABEL[k]}</span></button>
          })}
        </div>
      </section>
      <section>
        <h3>Quyền xem code khi xuất bản</h3>
        <p className="hint">Quyết định người đọc thấy những tab code nào khi mở hình lớn.</p>
        <div className="choice-grid">
          {(Object.keys(ACCESS_LABEL) as CodeAccess[]).map((k) => (
            <button key={k} className={'choice' + (fig.codeAccess === k ? ' on' : '')} aria-pressed={fig.codeAccess === k} onClick={() => onUpdate({ codeAccess: k })}><span>{ACCESS_LABEL[k]}</span></button>
          ))}
        </div>
      </section>
    </div>
  )
}
