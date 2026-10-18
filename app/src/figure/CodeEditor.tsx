// Code editor for a figure (CodeMirror 6): syntax highlighting, autocomplete that knows the
// document's datasets, columns and parameters, plus a prompt box to ask AI to change the code.
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { basicSetup } from 'codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { indentWithTab } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript'
import { python, pythonLanguage } from '@codemirror/lang-python'
import * as Plot from '@observablehq/plot'
import * as d3 from 'd3'
import { ArrowUp, Check, Loader2, Sparkles, Square } from 'lucide-react'
import { askAI } from '@/ai/ask'
import { asRows } from '@/data/import'
import type { FigureParam } from '@/editor/types'
import { DataContext } from './runtime'

export type Lang = 'js' | 'python'
/** What autocomplete and the AI need to know about the document. */
export type CodeHints = { datasets: Record<string, string[]>; params: FigureParam[] }

export function useCodeHints(params: FigureParam[]): CodeHints {
  const { data } = useContext(DataContext)
  return useMemo(() => ({
    datasets: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Object.keys(asRows(v)[0] ?? {})])),
    params,
  }), [data, params])
}

// ---- Autocomplete ----
const fn = (label: string, detail: string, info?: string): Completion => ({ label, type: 'function', detail, info })
const PLOT = Object.keys(Plot).filter((k) => /^[a-z]/.test(k)).map((k) => fn(k, 'Plot'))
const D3 = Object.keys(d3).filter((k) => /^[a-z]/.test(k)).map((k) => fn(k, 'd3'))
const ARRAY = ['filter', 'map', 'reduce', 'slice', 'sort', 'find', 'some', 'every', 'forEach', 'flatMap', 'length', 'includes', 'concat', 'join'].map((k) => fn(k, 'Array'))
const PANDAS_DF = ['groupby', 'agg', 'mean', 'sum', 'count', 'size', 'median', 'min', 'max', 'std', 'describe', 'head', 'tail', 'query', 'loc', 'iloc', 'merge', 'pivot_table', 'sort_values', 'reset_index', 'value_counts', 'apply', 'assign', 'dropna', 'fillna', 'rename', 'round', 'corr', 'to_dict', 'tolist', 'unique', 'nunique', 'astype', 'between', 'isin', 'shape', 'columns', 'plot'].map((k) => fn(k, 'pandas'))
const PD = ['DataFrame', 'Series', 'read_csv', 'cut', 'qcut', 'concat', 'merge', 'to_datetime', 'pivot_table', 'get_dummies'].map((k) => fn(k, 'pandas'))
const NP = ['array', 'arange', 'linspace', 'mean', 'median', 'std', 'sum', 'sqrt', 'exp', 'log', 'abs', 'where', 'clip', 'percentile', 'histogram', 'random', 'zeros', 'ones', 'round'].map((k) => fn(k, 'numpy'))

const columnOptions = (h: CodeHints, quote = false): Completion[] => {
  const seen = new Map<string, string[]>()
  for (const [k, cols] of Object.entries(h.datasets)) for (const c of cols) seen.set(c, [...(seen.get(c) ?? []), k])
  return [...seen].map(([c, ks]) => ({ label: quote ? c : c, type: 'property', detail: `column · ${ks.join(', ')}` }))
}
const paramOptions = (h: CodeHints): Completion[] =>
  h.params.map((p) => ({ label: p.name, type: 'variable', detail: `parameter ${p.min}–${p.max}`, info: p.label }))

function jsSource(get: () => CodeHints) {
  return (c: CompletionContext): CompletionResult | null => {
    const h = get()
    const inStr = c.matchBefore(/\[\s*["'][^"'\]]*$/) ?? c.matchBefore(/\b\w+\s*:\s*["'][^"']*$/)
    if (inStr) { const q = inStr.text.search(/["'][^"']*$/); return { from: inStr.from + q + 1, options: columnOptions(h, true), validFor: /^[^"']*$/ } }
    const mem = c.matchBefore(/[\w$]+\.[\w$]*$/)
    if (mem) {
      const [obj] = mem.text.split('.')
      const from = mem.from + obj.length + 1
      const opts = obj === 'Plot' ? PLOT : obj === 'd3' ? D3 : obj === 'pc' ? [fn('map', 'basemap (MapLibre)', 'pc.map({ data, kind: "points" | "heat" | "regions", lat, lon, color, size, basemap })'), fn('esc', 'escape HTML')]
        : obj === 'data' ? Object.entries(h.datasets).map(([k, cols]) => ({ label: k, type: 'variable', detail: `dataset · ${cols.length} columns` }))
        : obj === 'params' ? paramOptions(h)
        : h.datasets[obj] ? ARRAY : columnOptions(h)
      return { from, options: opts, validFor: /^[\w$]*$/ }
    }
    const w = c.matchBefore(/[\w$]+$/)
    if (!w && !c.explicit) return null
    return {
      from: w?.from ?? c.pos,
      options: [
        { label: 'Plot', type: 'namespace', detail: 'Observable Plot' }, { label: 'd3', type: 'namespace', detail: 'd3 v7' },
        { label: 'data', type: 'variable', detail: 'document datasets' }, { label: 'width', type: 'variable', detail: 'figure width (px)' },
        fn('expose', 'value to verify against Python'), { label: 'ket_qua', type: 'variable', detail: 'precomputed Python result' },
        { label: 'pc', type: 'namespace', detail: 'Papercell helpers' }, { label: 'params', type: 'variable', detail: 'all parameters' },
        ...paramOptions(h),
      ],
      validFor: /^[\w$]*$/,
    }
  }
}

function pySource(get: () => CodeHints) {
  return (c: CompletionContext): CompletionResult | null => {
    const h = get()
    const key = c.matchBefore(/data\[\s*["'][^"'\]]*$/)
    if (key) { const q = key.text.search(/["'][^"']*$/); return { from: key.from + q + 1, options: Object.keys(h.datasets).map((k) => ({ label: k, type: 'variable', detail: 'dataset' })), validFor: /^[^"']*$/ } }
    const col = c.matchBefore(/\[\s*["'][^"'\]]*$/)
    if (col) { const q = col.text.search(/["'][^"']*$/); return { from: col.from + q + 1, options: columnOptions(h, true), validFor: /^[^"']*$/ } }
    const mem = c.matchBefore(/\w+\.\w*$/)
    if (mem) {
      const [obj] = mem.text.split('.')
      const opts = obj === 'pd' ? PD : obj === 'np' ? NP : [...PANDAS_DF, ...columnOptions(h)]
      return { from: mem.from + obj.length + 1, options: opts, validFor: /^\w*$/ }
    }
    const w = c.matchBefore(/\w+$/)
    if (!w && !c.explicit) return null
    return {
      from: w?.from ?? c.pos,
      options: [{ label: 'data', type: 'variable', detail: 'dict of DataFrames' }, { label: 'ket_qua', type: 'variable', detail: 'assign the result here' },
        { label: 'pd', type: 'namespace', detail: 'pandas' }, { label: 'np', type: 'namespace', detail: 'numpy' }, ...paramOptions(h)],
      validFor: /^\w*$/,
    }
  }
}

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px', backgroundColor: 'var(--code-bg)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', fontVariantLigatures: 'none' },
  '.cm-gutters': { backgroundColor: 'var(--code-bg)', borderRight: '1px solid var(--line-2)', color: 'var(--ink-3)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: '#1d5fd1' },
})

/** CodeMirror editor; external value changes (e.g. from AI) are applied as an undoable edit. */
export function CodeEditor({ value, onChange, lang, hints, label, readOnly }: { value: string; onChange?: (v: string) => void; lang: Lang; hints?: CodeHints; label: string; readOnly?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const change = useRef(onChange); change.current = onChange
  const h = useRef<CodeHints>(hints ?? { datasets: {}, params: [] }); h.current = hints ?? h.current

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup, keymap.of([indentWithTab]), theme,
          indentUnit.of(lang === 'python' ? '    ' : '  '),
          lang === 'js' ? javascript() : python(),
          lang === 'js' ? javascriptLanguage.data.of({ autocomplete: jsSource(() => h.current) }) : pythonLanguage.data.of({ autocomplete: pySource(() => h.current) }),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((u) => { if (u.docChanged) change.current?.(u.state.doc.toString()) }),
          ...(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
        ],
      }),
    })
    view.current = v
    return () => v.destroy()
  }, [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = view.current
    if (v && value !== v.state.doc.toString()) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  // Keys typed in the editor must not reach the dialog / Plate editor shortcuts
  return <div ref={host} className="code-host" onKeyDown={(e) => e.stopPropagation()} />
}

// ---- AI prompt box ----
const RUNTIME = {
  js: `JavaScript figure code. It is the body of an async function. Available: Plot (Observable Plot 0.6), d3 (v7), data.<name> (parsed rows, numbers/dates auto-typed; GeoJSON stays a FeatureCollection), width (px), every parameter as a variable (and params.<name>), expose(value) to publish a value that is compared with the Python result, ket_qua (precomputed Python result for the current parameters, or undefined), pc.map({ data, kind: "points"|"heat"|"regions", lat, lon, color, size, basemap: "light"|"streets"|"bright"|"dark", width }) for a MapLibre map, pc.esc(text) to escape HTML. It must return a Plot figure, a DOM node, or an HTML string.`,
  python: `Original Python code (reference/verification; never shown to readers as the figure). Available: data["<name>"] as a pandas DataFrame (GeoJSON as dict), every parameter as a variable, pandas/numpy. Assign the value to compare with the JS expose() to the variable ket_qua.`,
}

function contextBlock(lang: Lang, code: string, other: string, h: CodeHints) {
  const ds = Object.entries(h.datasets).map(([k, cols]) => `- ${k}: ${cols.join(', ')}`).join('\n') || '(none)'
  const ps = h.params.map((p) => `- ${p.name} (${p.label}): ${p.min}–${p.max}, step ${p.step}, now ${p.value}`).join('\n') || '(none)'
  const fence = lang === 'js' ? 'js' : 'python'
  const otherLang = lang === 'js' ? 'python' : 'js'
  return `You are editing one figure of a Papercell document.\n${RUNTIME[lang]}\n\nDatasets and columns:\n${ds}\n\nParameters (sliders):\n${ps}\n\nCurrent code:\n\`\`\`${fence}\n${code}\n\`\`\`\n${other.trim() ? `\nThe figure's ${otherLang === 'js' ? 'JavaScript' : 'Python'} code, for reference:\n\`\`\`${otherLang}\n${other}\n\`\`\`\n` : ''}`
}

const extractCode = (text: string) => {
  const m = /```[\w-]*\n([\s\S]*?)```/.exec(text)
  return m ? { code: m[1].replace(/\n$/, ''), note: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim() } : null
}

export function CodeAssist({ lang, code, other, hints, error, onApply }: {
  lang: Lang; code: string; other: string; hints: CodeHints; error?: string | null; onApply: (code: string) => void
}) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const abort = useRef<AbortController | null>(null)

  const send = async (prompt: string) => {
    const q = prompt.trim(); if (!q || busy) return
    setBusy(true); setResult(null); setProgress('Sending…')
    const ctl = new AbortController(); abort.current = ctl
    try {
      const question = `${contextBlock(lang, code, other, hints)}\nRequest: ${q}\n\nReply with ONE fenced code block containing the complete new ${lang === 'js' ? 'JavaScript' : 'Python'} code (not a diff), then at most two short sentences about what changed.`
      const text = await askAI({ messages: [{ role: 'user', content: question }], doc: '', signal: ctl.signal, onUpdate: (s) => setProgress(s.progress || (s.content ? 'Writing code…' : 'Thinking…')) })
      const got = extractCode(text)
      if (!got) { setResult({ ok: false, text: text.slice(0, 400) }); return }
      onApply(got.code)
      setResult({ ok: true, text: got.note })
      setInput('')
    } catch (e) {
      setResult({ ok: false, text: (e as Error).name === 'AbortError' ? 'Stopped.' : (e as Error).message })
    } finally { setBusy(false); setProgress(''); abort.current = null }
  }

  const chips = [
    error && lang === 'js' ? 'Fix the error shown in the preview' : '',
    lang === 'js' && other.trim() ? 'Rewrite the Python code as JS that draws the same figure' : '',
    lang === 'python' && code.trim() === '' ? 'Write Python that computes the same result as the JS' : '',
    lang === 'js' ? 'Add a tooltip and a clear title' : '',
  ].filter(Boolean)

  return (
    <div className="code-assist">
      {(busy || result) && (
        <div className={'code-assist-status' + (result && !result.ok ? ' bad' : '')} role="status" aria-live="polite">
          {busy ? <><Loader2 size={14} className="spin" />{progress}</>
            : result?.ok ? <><Check size={14} /><span><b>Applied.</b> Ctrl+Z to undo. {result.text}</span></>
            : <span>{result?.text}</span>}
        </div>
      )}
      {!busy && chips.length > 0 && (
        <div className="code-assist-chips">{chips.map((c) => <button key={c} type="button" onClick={() => send(c)}><Sparkles size={12} />{c}</button>)}</div>
      )}
      <div className="code-assist-box">
        <textarea rows={2} value={input} disabled={busy} aria-label="Ask AI to change this code"
          placeholder={lang === 'js' ? 'Ask AI to change this code, e.g. "color the bars by region" or "use a log scale"' : 'Ask AI, e.g. "group by month and return the mean"'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }} />
        {busy
          ? <button type="button" className="pc-icon-btn" aria-label="Stop" onClick={() => abort.current?.abort()}><Square size={15} /></button>
          : <button type="button" className="pc-icon-btn send" aria-label="Send" disabled={!input.trim()} onClick={() => send(input)}><ArrowUp size={16} /></button>}
      </div>
    </div>
  )
}
