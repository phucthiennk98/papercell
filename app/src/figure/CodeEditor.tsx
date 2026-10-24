// Code editor for a figure (CodeMirror 6): syntax highlighting, autocomplete that knows the
// document's datasets, columns and parameters, plus a prompt box to ask AI to change the code.
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { ArrowUp, AtSign, Check, Loader2, Sparkles, Square } from 'lucide-react'
import { askAI } from '@/ai/ask'
import { asRows, describeColumns, type Column } from '@/data/import'
import skillJs from '@/ai/skills/figure-js.md?raw'
import skillPy from '@/ai/skills/figure-python.md?raw'
import { paramKind, type FigureParam } from '@/editor/types'
import { DataContext, labelsOf, type Labels } from './runtime'

export type Lang = 'js' | 'python'
/** What autocomplete and the AI need to know about the document. */
export type CodeHints = { datasets: Record<string, string[]>; params: FigureParam[]; labels: Labels }

export function useCodeHints(params: FigureParam[]): CodeHints {
  const { data, files } = useContext(DataContext)
  return useMemo(() => ({
    datasets: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Object.keys(asRows(v)[0] ?? {})])),
    params,
    labels: labelsOf(files),
  }), [data, files, params])
}

/** Short description of a parameter for suggestions and for the AI. */
const describeParam = (p: FigureParam) => {
  const k = paramKind(p)
  return k === 'select' || k === 'radio' ? `${k === 'radio' ? 'radio buttons' : 'dropdown'}: ${(p.options ?? []).map((o) => JSON.stringify(o)).join(' | ')}`
    : k === 'toggle' ? 'on/off switch: true | false'
    : `slider ${p.min}–${p.max}, step ${p.step}`
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
  h.params.map((p) => ({ label: p.name, type: 'variable', detail: describeParam(p), info: p.label }))

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
        fn('expose', 'value to verify against Python'), { label: 'result', type: 'variable', detail: 'precomputed Python result' },
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
      options: [{ label: 'data', type: 'variable', detail: 'dict of DataFrames' }, { label: 'result', type: 'variable', detail: 'assign the result here' },
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
  const h = useRef<CodeHints>(hints ?? { datasets: {}, params: [], labels: {} }); h.current = hints ?? h.current

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
    if (!v) return
    const cur = v.state.doc.toString()
    if (value === cur) return
    // Replace only the part that differs, so the caret and scroll position stay put
    let a = 0
    while (a < cur.length && a < value.length && cur[a] === value[a]) a++
    let b = 0
    while (b < cur.length - a && b < value.length - a && cur[cur.length - 1 - b] === value[value.length - 1 - b]) b++
    v.dispatch({ changes: { from: a, to: cur.length - b, insert: value.slice(a, value.length - b) } })
  }, [value])

  // Keys typed in the editor must not reach the dialog / Plate editor shortcuts
  return <div ref={host} className="code-host" onKeyDown={(e) => e.stopPropagation()} />
}

// ---- AI prompt box ----
// Skills: how to write Papercell figure code, sent with every request (src/ai/skills/*.md)
const SKILL: Record<Lang, string> = { js: skillJs, python: skillPy }

type Mention = { dataset: string; column?: string }
const MENTION = /@([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*))?/g

/** Short profile of a dataset or column, so the model knows types, ranges and categories. */
function profile(data: Record<string, unknown>, labels: Labels, m: Mention): string {
  const rows = asRows(data[m.dataset])
  if (!rows.length) return `- @${m.dataset}: (no rows)`
  const cols = describeColumns(rows).filter((c) => !m.column || c.name === m.column)
  if (m.column && !cols.length) return `- @${m.dataset}.${m.column}: column does not exist`
  const shown = (c: Column) => (labels[m.dataset]?.[c.name] ? `, display name "${labels[m.dataset][c.name]}"` : '')
  const line = (c: Column) => `${describe(c)}${shown(c)}`
  const describe = (c: Column) => {
    const vals = rows.map((r) => r[c.name]).filter((v) => v !== null && v !== undefined && v !== '')
    if (c.type === 'number' || c.type === 'lat' || c.type === 'lon') {
      const nums = vals as number[]
      return `${c.name} (number): min ${d3.min(nums)}, max ${d3.max(nums)}, mean ${d3.mean(nums)?.toFixed(2)}`
    }
    if (c.type === 'date') {
      const [a, b] = d3.extent(vals as Date[])
      return `${c.name} (date): ${a?.toISOString().slice(0, 10)} → ${b?.toISOString().slice(0, 10)}`
    }
    const top = d3.rollups(vals, (v) => v.length, String).sort((a, b) => b[1] - a[1])
    return `${c.name} (text, ${c.distinct} distinct): ${top.slice(0, 12).map(([k, n]) => `"${k}" ×${n}`).join(', ')}${top.length > 12 ? ', …' : ''}`
  }
  const head = m.column ? `- @${m.dataset}.${m.column}` : `- @${m.dataset} (${rows.length} rows)`
  return `${head}\n${cols.map((c) => `    ${line(c)}`).join('\n')}`
}

function parseMentions(text: string, datasets: Record<string, string[]>): Mention[] {
  const out = new Map<string, Mention>()
  for (const m of text.matchAll(MENTION)) {
    if (!datasets[m[1]]) continue
    const col = m[2] && datasets[m[1]].includes(m[2]) ? m[2] : undefined
    out.set(col ? `${m[1]}.${col}` : m[1], { dataset: m[1], column: col })
  }
  return [...out.values()]
}

function contextBlock(lang: Lang, code: string, other: string, h: CodeHints, refs: string) {
  const ds = Object.entries(h.datasets).map(([k, cols]) => `- ${k}: ${cols.map((c) => (h.labels[k]?.[c] ? `${c} (shown as "${h.labels[k][c]}")` : c)).join(', ')}`).join('\n') || '(none)'
  const ps = h.params.map((p) => `- ${p.name} (${p.label}): ${describeParam(p)}, now ${JSON.stringify(p.value)}`).join('\n') || '(none)'
  const fence = lang === 'js' ? 'js' : 'python'
  const otherLang = lang === 'js' ? 'python' : 'js'
  return `You are editing one figure of a Papercell document. Follow this skill:\n\n${SKILL[lang]}\n\n---\n\nDatasets and columns:\n${ds}\n\nParameters (sliders):\n${ps}\n${refs ? `\nData the user referred to with @ (use these exact names; the profile shows types, ranges and categories):\n${refs}\n` : ''}\nCurrent code:\n\`\`\`${fence}\n${code}\n\`\`\`\n${other.trim() ? `\nThe figure's ${otherLang === 'js' ? 'JavaScript' : 'Python'} code, for reference:\n\`\`\`${otherLang}\n${other}\n\`\`\`\n` : ''}`
}

const extractCode = (text: string) => {
  const m = /```[\w-]*\n([\s\S]*?)```/.exec(text)
  return m ? { code: m[1].replace(/\n$/, ''), note: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim() } : null
}

type MenuItem = { insert: string; label: string; detail: string; drill?: boolean }

export function CodeAssist({ lang, code, other, hints, error, onApply }: {
  lang: Lang; code: string; other: string; hints: CodeHints; error?: string | null; onApply: (code: string) => void
}) {
  const { data } = useContext(DataContext)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [menu, setMenu] = useState<{ items: MenuItem[]; index: number; from: number; to: number } | null>(null)
  const abort = useRef<AbortController | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const mentions = useMemo(() => parseMentions(input, hints.datasets), [input, hints.datasets])

  const pendingCaret = useRef<number | null>(null)
  // Grow with the text instead of scrolling (max ~6 lines, then scroll vertically); restore the caret after an @ insert
  useLayoutEffect(() => {
    const t = box.current; if (!t) return
    t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'
    if (pendingCaret.current !== null) { t.focus(); t.setSelectionRange(pendingCaret.current, pendingCaret.current); pendingCaret.current = null }
  }, [input])

  /** Open the @ menu when the caret is right after "@word" or "@table.col". */
  const updateMenu = (text: string, caret: number) => {
    const m = /@([A-Za-z_]\w*)?(?:\.(\w*))?$/.exec(text.slice(0, caret))
    if (!m) { setMenu(null); return }
    const [, ds = '', col] = m
    let items: MenuItem[]
    if (col !== undefined && hints.datasets[ds]) {
      items = hints.datasets[ds].filter((c) => c.toLowerCase().startsWith(col.toLowerCase()))
        .map((c) => ({ insert: `@${ds}.${c} `, label: `${ds}.${c}`, detail: hints.labels[ds]?.[c] ? `“${hints.labels[ds][c]}”` : 'column' }))
    } else {
      const q = ds.toLowerCase()
      items = [
        ...Object.entries(hints.datasets).filter(([k]) => k.toLowerCase().startsWith(q))
          .map(([k, cols]) => ({ insert: `@${k} `, label: k, detail: `table · ${cols.length} columns`, drill: true })),
        ...(q ? Object.entries(hints.datasets).flatMap(([k, cols]) => cols.filter((c) => c.toLowerCase().startsWith(q))
          .map((c) => ({ insert: `@${k}.${c} `, label: `${k}.${c}`, detail: 'column' }))) : []),
      ]
    }
    setMenu(items.length ? { items: items.slice(0, 30), index: 0, from: caret - m[0].length, to: caret } : null)
  }

  const pick = (item: MenuItem, drill = false) => {
    if (!menu) return
    const text = drill && item.drill ? item.insert.trimEnd() + '.' : item.insert
    const next = input.slice(0, menu.from) + text + input.slice(menu.to)
    const caret = menu.from + text.length
    setInput(next)
    pendingCaret.current = caret
    if (drill && item.drill) updateMenu(next, caret)
    else setMenu(null)
  }

  const send = async (prompt: string) => {
    const q = prompt.trim(); if (!q || busy) return
    setBusy(true); setResult(null); setProgress('Sending…'); setMenu(null)
    const ctl = new AbortController(); abort.current = ctl
    try {
      const refs = parseMentions(q, hints.datasets).map((m) => profile(data, hints.labels, m)).join('\n')
      const question = `${contextBlock(lang, code, other, hints, refs)}\nRequest: ${q}\n\nReply with ONE fenced code block containing the complete new ${lang === 'js' ? 'JavaScript' : 'Python'} code (not a diff), then at most two short sentences about what changed.`
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()
    if (menu) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const d = e.key === 'ArrowDown' ? 1 : -1
        setMenu({ ...menu, index: (menu.index + d + menu.items.length) % menu.items.length }); return
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(menu.items[menu.index], e.key === 'Tab'); return }
      if (e.key === 'Escape') { e.preventDefault(); setMenu(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

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
        {menu && (
          <ul className="mention-menu" role="listbox" aria-label="Tables and columns">
            {menu.items.map((it, i) => (
              <li key={it.label} role="option" aria-selected={i === menu.index} className={i === menu.index ? 'on' : ''}
                onMouseDown={(e) => { e.preventDefault(); pick(it) }} onMouseEnter={() => setMenu({ ...menu, index: i })}>
                <AtSign size={12} /><span className="lbl">{it.label}</span><span className="det">{it.detail}</span>
              </li>
            ))}
            <li className="foot">↑↓ choose · Enter insert{menu.items[menu.index]?.drill ? ' · Tab columns' : ''} · Esc close</li>
          </ul>
        )}
        <div className="code-assist-input">
          {mentions.length > 0 && (
            <div className="mention-chips" aria-label="Data sent with the request">
              {mentions.map((m) => <span key={m.dataset + (m.column ?? '')}><AtSign size={11} />{m.column ? `${m.dataset}.${m.column}` : m.dataset}</span>)}
            </div>
          )}
          <textarea ref={box} rows={1} value={input} disabled={busy} aria-label="Ask AI to change this code"
            placeholder={lang === 'js' ? 'Ask AI to change this code. Type @ to reference a table or @table.column' : 'Ask AI, e.g. "mean of @survey.income by @survey.region"'}
            onChange={(e) => { setInput(e.target.value); updateMenu(e.target.value, e.target.selectionStart) }}
            onClick={(e) => updateMenu(input, e.currentTarget.selectionStart)}
            onBlur={() => setTimeout(() => setMenu(null), 150)}
            onKeyDown={onKeyDown} />
        </div>
        {busy
          ? <button type="button" className="pc-icon-btn" aria-label="Stop" onClick={() => abort.current?.abort()}><Square size={15} /></button>
          : <button type="button" className="pc-icon-btn send" aria-label="Send" disabled={!input.trim()} onClick={() => send(input)}><ArrowUp size={16} /></button>}
      </div>
    </div>
  )
}
