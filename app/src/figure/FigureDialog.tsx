import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChartColumn, CircleCheck, CircleX, Code, Cpu, EyeOff, Loader2, Plus, Rows2, Trash2, X, type LucideIcon } from 'lucide-react'
import { asRows, describeColumns } from '@/data/import'
import { MetaContext } from '@/editor/DocHeader'
import { ACCESS_LABEL, CAPTION_LABEL, DEFAULT_FIG_PADDING, DISPLAY_LABEL, type CaptionKind, type CodeAccess, type FigureDisplay, type FigureNode, type FigureParam, type ParamKind, type ParamValue, isChoice, paramKind } from '../editor/types'
import { visibleCode } from './FigureElement'
import { captionKind, NEXT_CAPTION } from '@/editor/scan'
import { DesignTab } from './DesignTab'
import { paramFromColumn, specParams, syncFromCode } from './builder'
import { ScenarioTab } from './ScenarioTab'
import { CodeAssist, CodeEditor, useCodeHints } from './CodeEditor'
import { FigureView, ParamSliders } from './FigureView'
import { DataContext, dataKey } from './runtime'
import { verifyFigure } from './verify'

export type DialogTab = 'design' | 'figure' | 'code' | 'js' | 'python' | 'params' | 'verify' | 'scenarios' | 'settings'

const DISPLAY_ICON: Record<FigureDisplay, LucideIcon> = { output: ChartColumn, both: Rows2, code: Code, hidden: EyeOff }
const IDENT = /^[A-Za-z_$][\w$]*$/

type Props = {
  fig: FigureNode; params: FigureParam[]; number?: string; readOnly: boolean; initialTab: DialogTab
  onParam: (name: string, v: ParamValue) => void; onCommitParams: () => void
  onUpdate: (p: Partial<FigureNode>) => void; onClose: () => void
  applyPaddingAll?: (px: number) => void
}

export function FigureDialog({ fig, params, number, readOnly, initialTab, onParam, onCommitParams, onUpdate, onClose, applyPaddingAll }: Props) {
  const visibleLangs = visibleCode(fig).map((c) => (c.lang === 'JS' ? 'js' : 'python') as 'js' | 'python')
  const readTabs: [DialogTab, string][] = [['figure', 'Figure'], ...(visibleLangs.length ? [['code', 'Code'] as [DialogTab, string]] : [])]
  const editTabs: [DialogTab, string][] = [['design', 'Design'], ['figure', 'Figure'], ['code', 'Code'], ['params', 'Parameters'], ['verify', 'Verify & Precompute'], ['settings', 'Settings']]
  const tabs = readOnly ? readTabs : editTabs
  const normInitial: DialogTab = initialTab === 'js' || initialTab === 'python' ? 'code' : initialTab === 'scenarios' ? 'verify' : initialTab
  const [tab, setTab] = useState<DialogTab>(tabs.some(([t]) => t === normInitial) ? normInitial : 'figure')
  const [computeMode, setComputeMode] = useState<'verify' | 'scenarios'>(() =>
    initialTab === 'scenarios' || (!!fig.scenarios && !fig.verify) ? 'scenarios' : 'verify',
  )
  const [codeLang, setCodeLang] = useState<'js' | 'python'>(() => {
    if (initialTab === 'python' && (!readOnly || visibleLangs.includes('python'))) return 'python'
    if (readOnly && visibleLangs.length && !visibleLangs.includes('js')) return visibleLangs[0]
    return 'js'
  })
  const dlg = useRef<HTMLDivElement>(null)
  const initialSnapshotRef = useRef<{ figPatch: Partial<FigureNode>; params: FigureParam[] }>({
    figPatch: {
      caption: fig.caption,
      label: fig.label,
      js: fig.js,
      python: fig.python,
      params: fig.params,
      display: fig.display,
      codeAccess: fig.codeAccess,
      padding: fig.padding,
      spec: fig.spec,
      specDetached: fig.specDetached,
      codeBackup: fig.codeBackup,
      verify: fig.verify,
      scenarios: fig.scenarios,
    },
    params: params.map((p) => ({ ...p })),
  })

  const handleDone = () => {
    if (!readOnly) onCommitParams()
    onClose()
  }

  const handleCancel = () => {
    if (!readOnly) {
      onUpdate(initialSnapshotRef.current.figPatch)
      initialSnapshotRef.current.params.forEach((p) => onParam(p.name, p.value))
    }
    onClose()
  }

  const close = useRef(handleCancel); close.current = handleCancel
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
  const isDetached = !!fig.specDetached || (!fig.spec && fig.js.trim() !== '')

  return createPortal(
    <div className="dlg-backdrop" onMouseDown={handleCancel}>
      <div ref={dlg} className="dlg" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close.current() } e.stopPropagation() }}>
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
            {tabs.map(([t, l]) => {
              const detachedTab = t === 'design' && isDetached
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  data-tip={detachedTab ? 'Written in code (Design tab inactive unless applied)' : undefined}
                  className={(tab === t ? 'on' : '') + (detachedTab ? ' is-detached' : '')}
                  onClick={() => setTab(t)}
                >
                  {l}
                </button>
              )
            })}
          </nav>
          <div className="flex shrink-0 items-center gap-1.5">
            {!readOnly && (
              <button
                type="button"
                className="inline-flex h-7 cursor-pointer items-center justify-center rounded-md bg-blue-600 px-3 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                onClick={handleDone}
              >
                Done
              </button>
            )}
            <button className="pc-icon-btn" aria-label="Cancel and close" onClick={handleCancel}><X size={17} /></button>
          </div>
        </header>
        <div className="dlg-body">
          {tab === 'figure' && (
            <div className="dlg-figure">
              <FigureView js={fig.js} params={params} scenarios={fig.scenarios} className="is-large" />
              {params.length > 0 && <aside><ParamSliders params={params} onChange={onParam} onCommit={onCommitParams} idPrefix={'dlg-' + fig.id} large grid={fig.scenarios?.grid} /></aside>}
            </div>
          )}
          {readOnly && tab === 'code' && (
            <div className="dlg-code-read">
              {visibleLangs.length > 1 && (
                <div className="mb-2 flex items-center gap-1.5">
                  {visibleLangs.map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={codeLang === l}
                      onClick={() => setCodeLang(l)}
                      className={
                        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ' +
                        (codeLang === l ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground')
                      }
                    >
                      {l === 'js' ? <Code size={13} /> : <Cpu size={13} />}
                      <span>{l === 'js' ? 'JavaScript (Figure)' : 'Python (Original)'}</span>
                    </button>
                  ))}
                </div>
              )}
              <CodeEditor key={codeLang} value={codeLang === 'js' ? fig.js : fig.python} lang={codeLang} label={codeLang === 'js' ? 'JS code' : 'Original Python code'} readOnly />
            </div>
          )}
          {!readOnly && tab === 'design' && <DesignTab fig={fig} onUpdate={onUpdate} />}
          {!readOnly && tab === 'code' && <CodeTab key={codeLang} fig={fig} params={params} lang={codeLang} onLangChange={setCodeLang} onUpdate={onUpdate} />}
          {!readOnly && tab === 'params' && <ParamsTab fig={fig} onUpdate={onUpdate} />}
          {!readOnly && (tab === 'verify' || tab === 'scenarios') && (
            <div className="dlg-compute">
              <div className="dlg-compute-bar">
                <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="tablist" aria-label="Computation mode">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={computeMode === 'verify'}
                    onClick={() => setComputeMode('verify')}
                    className={
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium transition-colors ' +
                      (computeMode === 'verify' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')
                    }
                  >
                    <CircleCheck size={13} />
                    <span>Verify (Compare Python &amp; JS)</span>
                    {fig.verify && (
                      <span
                        className={'size-1.5 rounded-full ' + (fig.verify.ok ? 'bg-emerald-500' : 'bg-red-500')}
                        title={fig.verify.ok ? 'Verified' : 'Mismatch'}
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={computeMode === 'scenarios'}
                    onClick={() => setComputeMode('scenarios')}
                    className={
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium transition-colors ' +
                      (computeMode === 'scenarios' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')
                    }
                  >
                    <Cpu size={13} />
                    <span>Precompute (Cache all combinations)</span>
                    {fig.scenarios && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10.5px] font-semibold text-primary">
                        {fig.scenarios.count.toLocaleString('en-US')}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              {computeMode === 'verify' ? <VerifyTab fig={fig} onUpdate={onUpdate} /> : <ScenarioTab fig={fig} onUpdate={onUpdate} />}
            </div>
          )}
          {!readOnly && tab === 'settings' && <SettingsTab fig={fig} onUpdate={onUpdate} applyPaddingAll={applyPaddingAll} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const HINT = {
  js: 'Available: Plot, d3, data.<file>, width, expose(value), result (precomputed Python output) and every parameter as a variable. Return Plot.plot(...) or an HTML string. Ctrl+Space for suggestions.',
  python: 'Your original Python code, used for local verification and precomputing. Available: data["<file>"] (DataFrame) and the parameters. Assign the output to result.',
}

function CodeTab({
  fig,
  params,
  lang,
  onLangChange,
  onUpdate,
}: {
  fig: FigureNode
  params: FigureParam[]
  lang: 'js' | 'python'
  onLangChange: (l: 'js' | 'python') => void
  onUpdate: (p: Partial<FigureNode>) => void
}) {
  const { files, data } = useContext(DataContext)
  const [draft, setDraft] = useState(fig[lang])
  const [error, setError] = useState<string | null>(null)
  const hints = useCodeHints(params)
  const timer = useRef(0)
  const latest = useRef(fig); latest.current = fig
  const change = (v: string) => {
    setDraft(v)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const f = latest.current
      if (lang !== 'js' || !f.spec || f.specDetached) { onUpdate({ [lang]: v } as Partial<FigureNode>); return }
      // Built with the Design tab: editing only the `const chart = {...}` line keeps it in sync
      const r = syncFromCode(f.spec, v)
      if (r === 'detached') onUpdate({ js: v, specDetached: true })
      else if (r === 'pending') onUpdate({ js: v })
      else {
        const curFile = files.find((fl) => dataKey(fl.name) === r.spec.data)
        const nextParams = specParams(r.spec, data[r.spec.data], curFile?.labels).map((p) => ({
          ...p,
          value: f.params.find((o) => o.name === p.name)?.value ?? p.value,
        }))
        onUpdate({ js: r.js, spec: r.spec, params: nextParams })
        if (r.js !== v) setDraft(r.js)
      }
    }, 400)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <div className="dlg-code-edit">
      <div className="dlg-editor">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="tablist" aria-label="Code language">
            <button
              type="button"
              role="tab"
              aria-selected={lang === 'js'}
              onClick={() => onLangChange('js')}
              className={
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium transition-colors ' +
                (lang === 'js' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')
              }
            >
              <Code size={13} />
              <span>JavaScript (Draws figure)</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={lang === 'python'}
              onClick={() => onLangChange('python')}
              className={
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-medium transition-colors ' +
                (lang === 'python' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')
              }
            >
              <Cpu size={13} />
              <span>Python (Verify &amp; precompute)</span>
              {fig.python.trim() && <span className="size-1.5 rounded-full bg-emerald-500" title="Has Python code" />}
            </button>
          </div>
        </div>
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

type ParamRow = { name: string; label: string; kind: ParamKind; min: string; max: string; step: string; value: string; unit: string; options: string }
const toRow = (p: FigureParam): ParamRow => ({
  name: p.name, label: p.label, kind: paramKind(p), min: String(p.min), max: String(p.max), step: String(p.step),
  value: String(p.value), unit: p.unit ?? '', options: (p.options ?? []).join(', '),
})
/** "a, b, 3" → ['a', 'b', 3]: numeric options stay numbers so code can compute with them. */
const parseOptions = (t: string): (string | number | boolean)[] => t.split(',').map((x) => x.trim()).filter(Boolean)
  .map((x) => (x === 'true' ? true : x === 'false' ? false : isFinite(+x) ? +x : x))

function ParamsTab({ fig, onUpdate }: { fig: FigureNode; onUpdate: (p: Partial<FigureNode>) => void }) {
  const { files, data } = useContext(DataContext)
  const [rows, setRows] = useState<ParamRow[]>(() => fig.params.map(toRow))
  const [err, setErr] = useState('')
  const set = (i: number, patch: Partial<ParamRow>) => { setErr(''); setRows((r) => r.map((p, j) => (j === i ? { ...p, ...patch } : p))) }

  const dataColumns = useMemo(() => {
    const list: { key: string; col: string; distinct: number; label?: string }[] = []
    for (const f of files) {
      const k = dataKey(f.name)
      const cols = describeColumns(asRows(data[k]))
      for (const c of cols) {
        list.push({ key: k, col: c.name, distinct: c.distinct, label: f.labels?.[c.name] })
      }
    }
    return list
  }, [files, data])

  const addFromColumn = (val: string) => {
    if (!val) return
    const [dsKey, col] = val.split('::')
    if (!dsKey || !col) return
    const curFile = files.find((f) => dataKey(f.name) === dsKey)
    const fp = paramFromColumn(col, asRows(data[dsKey]), curFile?.labels?.[col] || col, false)
    let name = fp.name
    let n = 2
    while (rows.some((r) => r.name === name)) { name = `${fp.name}_${n++}` }
    setErr('')
    setRows([...rows, toRow({ ...fp, name })])
  }

  const save = () => {
    const out: FigureParam[] = []
    for (const r of rows) {
      if (!IDENT.test(r.name)) return setErr(`Name "${r.name}" is invalid: use letters, digits and _, not starting with a digit.`)
      if (out.some((p) => p.name === r.name)) return setErr(`Name "${r.name}" is used twice.`)
      const base = { name: r.name, label: r.label || r.name, unit: r.unit || undefined }
      if (isChoice(r.kind)) {
        const options = parseOptions(r.options)
        if (options.length < 2) return setErr(`Parameter "${r.name}": needs at least two options, separated by commas.`)
        const value = options.find((o) => String(o) === r.value.trim()) ?? options[0]
        out.push({ ...base, kind: r.kind, options, value, min: 0, max: 0, step: 1 })
      } else if (r.kind === 'toggle') {
        out.push({ ...base, kind: 'toggle', value: r.value === 'true', min: 0, max: 1, step: 1 })
      } else {
        const min = +r.min, max = +r.max, step = +r.step, value = +r.value
        if (!(max > min) || !(step > 0)) return setErr(`Parameter "${r.name}": max must be greater than min and step greater than 0.`)
        out.push({ ...base, min, max, step, value: Math.min(max, Math.max(min, isFinite(value) ? value : min)) })
      }
    }
    onUpdate({ params: out }); setErr('Saved.')
  }
  const changeKind = (i: number, kind: ParamKind) => {
    const r = rows[i]
    set(i, kind === 'toggle' ? { kind, value: 'false' }
      : isChoice(kind) ? { kind, options: r.options || 'A, B, C', value: r.options ? r.value : 'A' }
      : { kind, value: isFinite(+r.value) ? r.value : r.min })
  }
  const num = (i: number, k: 'min' | 'max' | 'step') => (
    <label className="param-num">{k}<input type="number" step="any" value={rows[i][k]} aria-label={k} onChange={(e) => set(i, { [k]: e.target.value })} /></label>
  )
  return (
    <div className="dlg-params">
      <p className="hint">Each parameter is a variable in both the JS and Python code, and shows on the figure as a slider, a dropdown, radio buttons or an on/off switch. If your dataset already contains a scenario/group column, use <b>Add from data column…</b> below to populate its values automatically.</p>
      <table>
        <thead><tr><th>Variable</th><th>Label</th><th>Control</th><th>Settings</th><th>Default</th><th>Unit</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><input value={r.name} aria-label="Variable" onChange={(e) => set(i, { name: e.target.value })} /></td>
              <td><input value={r.label} aria-label="Label" onChange={(e) => set(i, { label: e.target.value })} /></td>
              <td>
                <select value={r.kind} aria-label="Control" onChange={(e) => changeKind(i, e.target.value as ParamKind)}>
                  <option value="range">Slider</option><option value="select">Dropdown</option><option value="radio">Radio buttons</option><option value="toggle">On/off</option>
                </select>
              </td>
              <td className="param-settings">
                {r.kind === 'range' && <>{num(i, 'min')}{num(i, 'max')}{num(i, 'step')}</>}
                {isChoice(r.kind) && <input value={r.options} placeholder="option A, option B, 3" aria-label="Options (comma-separated)" onChange={(e) => set(i, { options: e.target.value })} />}
                {r.kind === 'toggle' && <span className="hint">true / false</span>}
              </td>
              <td>
                {isChoice(r.kind) ? (
                  <select value={r.value} aria-label="Default" onChange={(e) => set(i, { value: e.target.value })}>
                    {parseOptions(r.options).map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
                  </select>
                ) : r.kind === 'toggle' ? (
                  <select value={r.value} aria-label="Default" onChange={(e) => set(i, { value: e.target.value })}><option value="false">off</option><option value="true">on</option></select>
                ) : (
                  <input type="number" step="any" value={r.value} aria-label="Default" onChange={(e) => set(i, { value: e.target.value })} />
                )}
              </td>
              <td><input value={r.unit} aria-label="Unit" onChange={(e) => set(i, { unit: e.target.value })} /></td>
              <td><button className="pc-icon-btn" aria-label="Delete parameter" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button className="btn" onClick={() => setRows([...rows, toRow({ name: `param_${rows.length + 1}`, label: 'New parameter', min: 0, max: 10, step: 1, value: 5 })])}><Plus size={14} /> Add parameter</button>
        {dataColumns.length > 0 && (
          <select
            className="h-8 rounded-md border bg-background px-2 text-[13px] outline-none focus:border-ring"
            value=""
            aria-label="Add parameter from data column"
            onChange={(e) => { addFromColumn(e.target.value); e.target.value = '' }}
          >
            <option value="">+ Add from data column…</option>
            {dataColumns.map((dc) => (
              <option key={`${dc.key}::${dc.col}`} value={`${dc.key}::${dc.col}`}>
                {dc.key}.{dc.col} ({dc.distinct} values)
              </option>
            ))}
          </select>
        )}
        <button className="btn primary" onClick={save}>Save parameters</button>
        {err && <span className={err === 'Saved.' ? 'ok' : 'pc-err'}>{err}</span>}
      </div>
    </div>
  )
}

function VerifyTab({ fig, onUpdate }: { fig: FigureNode; onUpdate: (p: Partial<FigureNode>) => void }) {
  const { files } = useContext(DataContext)
  const [pyInfo, setPyInfo] = useState<{ available: boolean; version?: string; pandas?: string; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/python')
      .then((r) => r.json())
      .then((j) => setPyInfo(j))
      .catch(() => setPyInfo({ available: false, error: 'Local Python server unreachable' }))
  }, [])

  const run = async () => { setBusy(true); try { onUpdate({ verify: await verifyFigure(fig, files) }) } finally { setBusy(false) } }
  const v = fig.verify
  return (
    <div className="dlg-verify">
      <p>Verification runs the <b>original Python</b> on your local Python server and the <b>JS code</b> on the same data and parameter values, then compares every number.</p>
      <ol className="hint">
        <li>In the <b>Code</b> tab (Python), assign the result to compare to <code>result</code> (number, list, dict, Series or DataFrame).</li>
        <li>In the <b>Code</b> tab (JavaScript), call <code>expose(value)</code> with the matching result (number, array, object or Map).</li>
        <li>Available data: {files.length ? files.map((f) => <code key={f.name}>{dataKey(f.name)}</code>).reduce((a, b) => <>{a}, {b}</>) : 'no files yet'}.</li>
      </ol>
      <div className="row">
        <button className="btn primary" onClick={run} disabled={busy || (pyInfo !== null && !pyInfo.available)}>{busy ? <><Loader2 size={14} className="spin" /> Verifying…</> : 'Run verification'}</button>
        <span className="hint">
          {pyInfo === null
            ? 'Detecting local Python…'
            : pyInfo.available
              ? `Local Python ${pyInfo.version} · pandas ${pyInfo.pandas}`
              : pyInfo.error || 'Local Python not available'}
        </span>
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

function SettingsTab({ fig, onUpdate, applyPaddingAll }: { fig: FigureNode; onUpdate: (p: Partial<FigureNode>) => void; applyPaddingAll?: (px: number) => void }) {
  const { meta } = useContext(MetaContext)
  const docPad = meta.figurePadding ?? DEFAULT_FIG_PADDING
  const pad = fig.padding ?? docPad
  const [applied, setApplied] = useState(false)
  return (
    <div className="dlg-settings">
      <section>
        <h3>Inner padding</h3>
        <p className="hint">Space between the card border and the chart. Figures without their own value use the document default ({docPad}px), so they line up.</p>
        <div className="row pad-row">
          <input type="range" min={0} max={48} step={2} value={pad} aria-label="Inner padding (px)" onChange={(e) => { setApplied(false); onUpdate({ padding: +e.target.value }) }} />
          <output>{pad}px</output>
          <span className="hint">{fig.padding === undefined ? 'document default' : 'this figure only'}</span>
        </div>
        <div className="row">
          {applyPaddingAll && <button className="btn primary" onClick={() => { applyPaddingAll(pad); setApplied(true) }}>Apply to all figures</button>}
          {fig.padding !== undefined && <button className="btn" onClick={() => onUpdate({ padding: undefined })}>Use document default</button>}
          {applied && <span className="ok">Every figure now uses {pad}px.</span>}
        </div>
      </section>
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
