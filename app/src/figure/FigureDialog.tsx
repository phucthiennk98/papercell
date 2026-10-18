import { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { ChartColumn, CircleCheck, CircleX, Code, EyeOff, Loader2, Plus, Rows2, Trash2, X, type LucideIcon } from 'lucide-react'
import { kernel } from '../python/kernel'
import { ACCESS_LABEL, CAPTION_LABEL, DISPLAY_LABEL, type CaptionKind, type CodeAccess, type FigureDisplay, type FigureNode, type FigureParam } from '../editor/types'
import { visibleCode } from './FigureElement'
import { captionKind, NEXT_CAPTION } from '@/editor/scan'
import { DesignTab } from './DesignTab'
import { ScenarioTab } from './ScenarioTab'
import { CodeAssist, CodeEditor, useCodeHints } from './CodeEditor'
import { FigureView, ParamSliders } from './FigureView'
import { DataContext, dataKey } from './runtime'
import { verifyFigure } from './verify'

export type DialogTab = 'design' | 'figure' | 'js' | 'python' | 'params' | 'verify' | 'scenarios' | 'settings'

const DISPLAY_ICON: Record<FigureDisplay, LucideIcon> = { output: ChartColumn, both: Rows2, code: Code, hidden: EyeOff }
const IDENT = /^[A-Za-z_$][\w$]*$/

type Props = {
  fig: FigureNode; params: FigureParam[]; number?: string; readOnly: boolean; initialTab: DialogTab
  onParam: (name: string, v: number) => void; onCommitParams: () => void
  onUpdate: (p: Partial<FigureNode>) => void; onClose: () => void
}

export function FigureDialog({ fig, params, number, readOnly, initialTab, onParam, onCommitParams, onUpdate, onClose }: Props) {
  const readTabs: [DialogTab, string][] = [['figure', 'Figure'], ...visibleCode(fig).map((c) => [c.lang === 'JS' ? 'js' : 'python', c.lang === 'JS' ? 'JS code' : 'Original Python'] as [DialogTab, string])]
  const editTabs: [DialogTab, string][] = [['design', 'Design'], ['figure', 'Figure'], ['js', 'JS code'], ['python', 'Original Python'], ['params', 'Parameters'], ['verify', 'Verify'], ['scenarios', 'Precompute'], ['settings', 'Settings']]
  const tabs = readOnly ? readTabs : editTabs
  const [tab, setTab] = useState<DialogTab>(tabs.some(([t]) => t === initialTab) ? initialTab : 'figure')
  const dlg = useRef<HTMLDivElement>(null)

  // Chỉ chạy một lần khi mở: nếu chạy lại mỗi lần render, popup sẽ giật focus khỏi ô đang gõ
  const close = useRef(onClose); close.current = onClose
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    dlg.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => { removeEventListener('keydown', onKey); document.body.classList.remove('modal-open'); prev?.focus?.() }
  }, [])

  const title = `${number ? `${number}. ` : ''}${fig.caption || 'Untitled figure'}`
  const kind = captionKind(fig)

  return createPortal(
    <div className="dlg-backdrop" onMouseDown={onClose}>
      <div ref={dlg} className="dlg" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}>
        <header className="dlg-head">
          {readOnly ? <span className="dlg-title">{title}</span> : (
            <div className="dlg-title dlg-title-edit">
              <button type="button" className={'fig-no-btn' + (number ? '' : ' none')} data-tip="Click to switch: Figure → Table → no number"
                aria-label="Caption label" onClick={() => onUpdate({ label: NEXT_CAPTION[kind] })}>
                {number ? `${number}.` : kind === 'none' ? 'No number' : CAPTION_LABEL[kind]}
              </button>
              <input key={fig.caption} defaultValue={fig.caption} placeholder="Add a caption…" aria-label="Caption"
                onBlur={(e) => { if (e.target.value !== fig.caption) onUpdate({ caption: e.target.value }) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
            </div>
          )}
          <nav className="dlg-tabs" role="tablist">
            {tabs.map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{l}</button>)}
          </nav>
          <button className="pc-icon-btn" aria-label="Close" onClick={onClose}><X size={17} /></button>
        </header>
        <div className="dlg-body">
          {tab === 'figure' && (
            <div className="dlg-figure">
              <FigureView js={fig.js} params={params} scenarios={fig.scenarios} className="is-large" />
              {params.length > 0 && <aside><ParamSliders params={params} onChange={onParam} onCommit={onCommitParams} idPrefix={'dlg-' + fig.id} large grid={fig.scenarios?.grid} /></aside>}
            </div>
          )}
          {readOnly && (tab === 'js' || tab === 'python') && <div className="dlg-code-read"><CodeEditor key={tab} value={tab === 'js' ? fig.js : fig.python} lang={tab} label={tab === 'js' ? 'JS code' : 'Original Python code'} readOnly /></div>}
          {!readOnly && tab === 'design' && <DesignTab fig={fig} onUpdate={onUpdate} />}
          {!readOnly && tab === 'js' && <CodeTab fig={fig} params={params} lang="js" onUpdate={onUpdate} />}
          {!readOnly && tab === 'python' && <CodeTab fig={fig} params={params} lang="python" onUpdate={onUpdate} />}
          {!readOnly && tab === 'params' && <ParamsTab fig={fig} onUpdate={onUpdate} />}
          {!readOnly && tab === 'verify' && <VerifyTab fig={fig} onUpdate={onUpdate} />}
          {!readOnly && tab === 'scenarios' && <ScenarioTab fig={fig} onUpdate={onUpdate} />}
          {!readOnly && tab === 'settings' && <SettingsTab fig={fig} onUpdate={onUpdate} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const HINT = {
  js: 'Available: Plot, d3, data.<file>, width, expose(value), ket_qua (precomputed Python result) and every parameter as a variable. Return Plot.plot(...) or an HTML string. Ctrl+Space for suggestions.',
  python: 'Your original code, used for verification and precomputing. Available: data["<file>"] (DataFrame) and the parameters. Assign the result to compare to ket_qua.',
}

function CodeTab({ fig, params, lang, onUpdate }: { fig: FigureNode; params: FigureParam[]; lang: 'js' | 'python'; onUpdate: (p: Partial<FigureNode>) => void }) {
  const [draft, setDraft] = useState(fig[lang])
  const [error, setError] = useState<string | null>(null)
  const hints = useCodeHints(params)
  const timer = useRef(0)
  const change = (v: string) => {
    setDraft(v)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onUpdate({ [lang]: v, ...(lang === 'js' && fig.spec ? { specDetached: true } : {}) } as Partial<FigureNode>), 400)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <div className="dlg-code-edit">
      <div className="dlg-editor">
        <p className="hint">{HINT[lang]}</p>
        <CodeEditor value={draft} onChange={change} lang={lang} hints={hints} label={lang === 'js' ? 'JS code' : 'Original Python code'} />
        <CodeAssist lang={lang} code={draft} other={lang === 'js' ? fig.python : fig.js} hints={hints} error={error} onApply={change} />
      </div>
      <div className="dlg-preview">
        <p className="hint">{lang === 'js' ? 'Preview (updates as you type)' : 'Figure as drawn by the JS code'}</p>
        <FigureView js={lang === 'js' ? draft : fig.js} params={params} scenarios={fig.scenarios} onError={setError} />
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
      if (!IDENT.test(r.name)) return setErr(`Name "${r.name}" is invalid: use letters, digits and _, not starting with a digit.`)
      if (out.some((p) => p.name === r.name)) return setErr(`Name "${r.name}" is used twice.`)
      if (!(max > min) || !(step > 0)) return setErr(`Parameter "${r.name}": max must be greater than min and step greater than 0.`)
      out.push({ name: r.name, label: r.label || r.name, min, max, step, value: Math.min(max, Math.max(min, value)), unit: r.unit })
    }
    onUpdate({ params: out }); setErr('Saved.')
  }
  return (
    <div className="dlg-params">
      <p className="hint">Each parameter is a variable in both the JS and Python code, and shows as a slider on the figure.</p>
      <table>
        <thead><tr><th>Variable</th><th>Label</th><th>Min</th><th>Max</th><th>Step</th><th>Default</th><th>Unit</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {(['name', 'label', 'min', 'max', 'step', 'value', 'unit'] as (keyof FigureParam)[]).map((k) => (
                <td key={k}><input value={String(r[k] ?? '')} aria-label={k} type={['min', 'max', 'step', 'value'].includes(k) ? 'number' : 'text'} step="any" onChange={(e) => set(i, k, e.target.value)} /></td>
              ))}
              <td><button className="pc-icon-btn" aria-label="Delete parameter" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button className="btn" onClick={() => setRows([...rows, { name: `param_${rows.length + 1}`, label: 'New parameter', min: 0, max: 10, step: 1, value: 5, unit: '' }])}><Plus size={14} /> Add parameter</button>
        <button className="btn primary" onClick={save}>Save parameters</button>
        {err && <span className={err === 'Saved.' ? 'ok' : 'pc-err'}>{err}</span>}
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
      <p>Verification runs the <b>original Python</b> and the <b>JS code</b> on the same data and parameter values, then compares every number.</p>
      <ol className="hint">
        <li>In Python, assign the result to compare to <code>ket_qua</code> (number, list, dict, Series or DataFrame).</li>
        <li>In JS, call <code>expose(value)</code> with the matching result (number, array, object or Map).</li>
        <li>Available data: {files.length ? files.map((f) => <code key={f.name}>{dataKey(f.name)}</code>).reduce((a, b) => <>{a}, {b}</>) : 'no files yet'}.</li>
      </ol>
      <div className="row">
        <button className="btn primary" onClick={run} disabled={busy}>{busy ? <><Loader2 size={14} className="spin" /> Verifying…</> : 'Run verification'}</button>
        <span className="hint">Python: {status.text} (first load takes about 10–20 seconds)</span>
      </div>
      {v && (
        <div className={'verify-box ' + (v.ok ? 'ok' : 'bad')}>
          {v.ok ? <CircleCheck size={18} /> : <CircleX size={18} />}
          <div><b>{v.ok ? 'Match' : 'Mismatch'}</b><p>{v.message}</p><small>Run at: {new Date(v.at).toLocaleString('en-US')}</small></div>
        </div>
      )}
    </div>
  )
}

function SettingsTab({ fig, onUpdate }: { fig: FigureNode; onUpdate: (p: Partial<FigureNode>) => void }) {
  return (
    <div className="dlg-settings">
      <section>
        <h3>Display in the document</h3>
        <div className="choice-grid">
          {(Object.keys(DISPLAY_LABEL) as FigureDisplay[]).map((k) => {
            const Icon = DISPLAY_ICON[k]
            return <button key={k} className={'choice' + (fig.display === k ? ' on' : '')} aria-pressed={fig.display === k} onClick={() => onUpdate({ display: k })}><Icon size={18} /><span>{DISPLAY_LABEL[k]}</span></button>
          })}
        </div>
      </section>
      <section>
        <h3>Caption label</h3>
        <p className="hint">Figures and tables are numbered separately (Figure 1, 2… and Table 1, 2…). Automatic: tables are Tables, everything else is a Figure.</p>
        <div className="choice-grid">
          <button className={'choice' + (!fig.label ? ' on' : '')} aria-pressed={!fig.label} onClick={() => onUpdate({ label: undefined })}><span>Automatic ({CAPTION_LABEL[captionKind({ ...fig, label: undefined })]})</span></button>
          {(Object.keys(CAPTION_LABEL) as CaptionKind[]).map((k) => (
            <button key={k} className={'choice' + (fig.label === k ? ' on' : '')} aria-pressed={fig.label === k} onClick={() => onUpdate({ label: k })}><span>{CAPTION_LABEL[k]}</span></button>
          ))}
        </div>
      </section>
      <section>
        <h3>Code visible to readers</h3>
        <p className="hint">Choose which code tabs readers see when they open the figure.</p>
        <div className="choice-grid">
          {(Object.keys(ACCESS_LABEL) as CodeAccess[]).map((k) => (
            <button key={k} className={'choice' + (fig.codeAccess === k ? ' on' : '')} aria-pressed={fig.codeAccess === k} onClick={() => onUpdate({ codeAccess: k })}><span>{ACCESS_LABEL[k]}</span></button>
          ))}
        </div>
      </section>
    </div>
  )
}
