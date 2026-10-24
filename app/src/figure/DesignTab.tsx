import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Code, FileUp, Loader2, Palette, Plus, RotateCcw, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { ACCEPT, asRows, describeColumns, importFile, isGeoJSON, type Column, type ColType } from '@/data/import'
import type { FigureNode, FigureParam, ParamValue } from '@/editor/types'
import { AGG_LABEL, CHART_TYPES, codegen, customScaleColors, defaultSpec, isCustomScheme, parseCustomColors, SCHEME_META, SCHEMES, specParams, typeInfo, type Agg, type Channel, type ChartSpec, type ChartType } from './builder'
import { FigureView, ParamSliders } from './FigureView'
import { BASEMAPS, type Basemap } from './map'
import { DataContext, dataKey } from './runtime'

const TYPE_BADGE: Record<ColType, string> = { number: 'number', date: 'date', text: 'text', lat: 'latitude', lon: 'longitude' }

/** Merge regenerated spec parameters while keeping user-selected values when parameter names match. */
const mergeParams = (old: FigureParam[], fresh: FigureParam[]) => fresh.map((p) => {
  const prev = old.find((o) => o.name === p.name)
  if (!prev) return p
  if (p.options?.length && !p.options.some((o) => String(o) === String(prev.value))) return p
  return { ...p, value: prev.value }
})

export function DesignTab({ fig, onUpdate }: { fig: FigureNode; onUpdate: (p: Partial<FigureNode>) => void }) {
  const { files, data, setFiles } = useContext(DataContext)
  const keys = files.map((f) => dataKey(f.name))
  const pick = (type: ChartType) => (type === 'map-regions' ? keys.find((k) => isGeoJSON(data[k])) : keys.find((k) => !isGeoJSON(data[k]))) ?? keys[0] ?? ''
  const [spec, setSpec] = useState<ChartSpec>(() => fig.spec ? { ...fig.spec, data: fig.spec.data || pick(fig.spec.type) } : defaultSpec(pick('bar')))
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)
  const [msg, setMsg] = useState('')
  const [activeStop, setActiveStop] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const raw = data[spec.data]
  const cur = files.find((f) => dataKey(f.name) === spec.data)
  const columns = useMemo(() => describeColumns(asRows(raw)), [raw])
  const geo = isGeoJSON(raw)
  const info = typeInfo(spec.type)
  const detached = !!fig.specDetached || (!fig.spec && fig.js.trim() !== '')
  const js = codegen(spec)
  const params = mergeParams(fig.params, specParams(spec, raw, cur?.labels))

  useEffect(() => {
    if (!fig.spec || detached) return
    if (!spec.data || (fig.spec?.data === spec.data && !(info.map && spec.type !== 'map-regions' && !spec.lat))) return
    const next = { ...spec }
    if (info.map) {
      next.lat ??= columns.find((c) => c.type === 'lat')?.name
      next.lon ??= columns.find((c) => c.type === 'lon')?.name
    }
    apply(next)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const aliasCols = spec.type === 'table' && !spec.x
    ? columns.map((c) => c.name)
    : [...new Set([spec.x, spec.y, spec.color, spec.size, spec.facet, ...(spec.filters ?? [])].filter((c): c is string => !!c))]
  const setLabel = (col: string, value: string) => {
    if (!cur) return
    const labels = { ...(cur.labels ?? {}) }
    if (value.trim() && value.trim() !== col) labels[col] = value.trim(); else delete labels[col]
    if ((cur.labels?.[col] ?? '') === (labels[col] ?? '')) return
    setFiles(files.map((f) => (f === cur ? { ...f, labels } : f)))
  }

  const apply = (next: ChartSpec, force = false) => {
    setSpec(next); setTouched(true)
    if (detached && !force) { if (fig.spec) onUpdate({ spec: next }); return }
    const nextFile = files.find((f) => dataKey(f.name) === next.data)
    const backup = detached ? { codeBackup: { js: fig.js, params: fig.params, spec: fig.spec, specDetached: fig.specDetached } } : {}
    onUpdate({
      spec: next,
      js: codegen(next),
      params: mergeParams(fig.params, specParams(next, data[next.data], nextFile?.labels)),
      specDetached: false,
      ...backup,
    })
  }
  const restore = () => {
    const b = fig.codeBackup; if (!b) return
    onUpdate({ js: b.js, params: b.params, spec: b.spec, specDetached: b.specDetached, codeBackup: undefined })
    if (b.spec) setSpec(b.spec)
  }
  const set = (patch: Partial<ChartSpec>) => apply({ ...spec, ...patch })

  const toggleFilter = (col: string) => {
    const curFilters = spec.filters ?? []
    const nextFilters = curFilters.includes(col) ? curFilters.filter((c) => c !== col) : [...curFilters, col]
    set({ filters: nextFilters.length ? nextFilters : undefined })
  }

  const chooseType = (type: ChartType) => {
    const next: ChartSpec = { ...spec, type }
    if (typeInfo(type).map) {
      next.lat ??= columns.find((c) => c.type === 'lat')?.name
      next.lon ??= columns.find((c) => c.type === 'lon')?.name
    }
    apply(next)
  }

  const load = async (list: FileList | null) => {
    if (!list?.length) return
    setBusy(true); setMsg('')
    try {
      let next = [...files], first = ''
      for (const f of Array.from(list)) {
        for (const d of await importFile(f)) {
          next = [...next.filter((x) => x.name !== d.name), d]
          first ||= dataKey(d.name)
        }
      }
      setFiles(next)
      if (first) apply({ ...spec, data: first, x: undefined, y: undefined, color: undefined, size: undefined, facet: undefined, lat: undefined, lon: undefined, filters: undefined })
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  const colOptions = (allow?: (c: Column) => boolean) => columns.filter((c) => !allow || allow(c))
  const field = 'h-8 w-full rounded-md border bg-background px-2 text-[13px] outline-none focus:border-ring'
  const activeParams = detached && !touched ? fig.params : params
  const setPreviewParam = (name: string, v: ParamValue) => {
    onUpdate({ params: activeParams.map((p) => (p.name === name ? { ...p, value: v } : p)) })
  }

  return (
    <div className="dlg-design">
      <div className="dlg-design-form">
        {detached && (
          <div className="detached-card">
            <div className="detached-card-top">
              <span className="detached-icon"><Code size={14} /></span>
              <div className="detached-copy">
                <b>{fig.spec ? 'Edited in JavaScript' : 'Written in custom code'}</b>
                <span>Controls below preview only until applied.</span>
              </div>
              <button type="button" className="btn primary detached-btn" onClick={() => apply(spec, true)}>
                <Sparkles size={13} />
                Apply design
              </button>
            </div>
          </div>
        )}
        {fig.codeBackup && !detached && (
          <div className="detached-card">
            <div className="detached-card-top">
              <span className="detached-icon"><RotateCcw size={14} /></span>
              <div className="detached-copy">
                <b>Design applied</b>
                <span>Replaced previous custom JS code.</span>
              </div>
              <button type="button" className="btn detached-btn" onClick={restore}>
                Restore code
              </button>
            </div>
          </div>
        )}

        <div className={detached ? 'dlg-design-sections is-detached' : 'dlg-design-sections'}>
        <section>
          <h3>Data</h3>
          <div className="flex gap-2">
            <select className={field} value={spec.data} onChange={(e) => apply({ ...defaultSpec(e.target.value), type: spec.type, scheme: spec.scheme, basemap: spec.basemap })} aria-label="Dataset">
              {!keys.length && <option value="">No data yet</option>}
              {keys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <button className="btn shrink-0" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <FileUp size={14} />}Load file
            </button>
            <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { load(e.target.files); e.target.value = '' }} />
          </div>
          <p className="hint">CSV, TXT, TSV, Excel (.xlsx), JSON, GeoJSON. {raw ? `${geo ? 'GeoJSON' : 'Table'} · ${asRows(raw).length.toLocaleString('en-US')} rows · ${columns.length} columns` : ''}</p>
          {msg && <p className="pc-err">{msg}</p>}
        </section>

        <section>
          <h3>Chart type</h3>
          <div className="type-grid" role="radiogroup" aria-label="Chart type">
            {CHART_TYPES.map((t) => {
              const disabled = t.type === 'map-regions' && !geo
              return (
                <button key={t.type} role="radio" aria-checked={spec.type === t.type} disabled={disabled}
                  title={disabled ? 'Needs GeoJSON data with polygons' : t.label}
                  className={'type-btn' + (spec.type === t.type ? ' on' : '')} onClick={() => chooseType(t.type)}>
                  <t.icon size={18} strokeWidth={1.7} /><span>{t.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <h3>Columns</h3>
          {info.channels.map((c) => (
            <label key={c.channel} className="design-row">
              <span>{c.label}{c.required && <b className="req">*</b>}</span>
              <select className={field} value={spec[c.channel] ?? ''} onChange={(e) => set({ [c.channel]: e.target.value || undefined } as Partial<ChartSpec>)}>
                <option value="">{c.hint ? `— ${c.hint} —` : '— none —'}</option>
                {colOptions(c.channel === 'lat' || c.channel === 'lon' || c.channel === 'size' ? (col) => col.type !== 'text' && col.type !== 'date' : undefined).map((col) => (
                  <option key={col.name} value={col.name}>{col.name} · {TYPE_BADGE[col.type]}</option>
                ))}
              </select>
            </label>
          ))}
          {info.agg && (
            <label className="design-row"><span>Aggregate</span>
              <select className={field} value={spec.agg} onChange={(e) => set({ agg: e.target.value as Agg })}>
                {(Object.keys(AGG_LABEL) as Agg[]).filter((a) => a !== 'none' || spec.type === 'line' || spec.type === 'area').map((a) => <option key={a} value={a}>{AGG_LABEL[a]}</option>)}
              </select>
            </label>
          )}
          {info.sort && (
            <label className="design-row"><span>Sort</span>
              <select className={field} value={spec.sort} onChange={(e) => set({ sort: e.target.value as ChartSpec['sort'] })}>
                <option value="none">Data order</option><option value="desc">Descending</option><option value="asc">Ascending</option>
              </select>
            </label>
          )}
          {info.bins && <p className="hint">The number of bins is a slider readers can drag.</p>}
        </section>

        {columns.length > 0 && spec.type !== 'map-regions' && (
          <section>
            <h3>Scenario / filter controls</h3>
            <p className="hint">Pick columns that already tag scenarios, groups, or years in <code>{spec.data}</code> to give readers interactive filter controls without precomputing.</p>
            <div className="flex flex-wrap gap-1.5">
              {columns.map((col) => {
                const on = (spec.filters ?? []).includes(col.name)
                return (
                  <button
                    key={col.name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleFilter(col.name)}
                    className={
                      'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition-colors ' +
                      (on ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground')
                    }
                  >
                    <SlidersHorizontal size={12} />
                    <span>{col.name}</span>
                    <span className="opacity-65">({col.distinct})</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {aliasCols.length > 0 && cur && (
          <section>
            <h3>Column names</h3>
            <p className="hint">Display names used in table headers, axes and legends (empty = the name from the file). Shared by every figure using <code>{spec.data}</code>.</p>
            {aliasCols.map((c) => (
              <label key={c} className="design-row"><span className="col-name" title={c}>{c}</span>
                <input key={c + (cur.labels?.[c] ?? '')} className={field} defaultValue={cur.labels?.[c] ?? ''} placeholder={c}
                  onBlur={(e) => setLabel(c, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
              </label>
            ))}
          </section>
        )}

        <section>
          <h3>Display</h3>
          {!info.map && spec.type !== 'table' && <>
            <label className="design-row"><span>X axis label</span><input className={field} value={spec.xLabel ?? ''} placeholder="automatic" onChange={(e) => set({ xLabel: e.target.value || undefined })} /></label>
            <label className="design-row"><span>Y axis label</span><input className={field} value={spec.yLabel ?? ''} placeholder="automatic" onChange={(e) => set({ yLabel: e.target.value || undefined })} /></label>
          </>}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-[var(--ink-2)]">Color palette</span>
              <span className="text-[11px] font-medium text-muted-foreground">
                {isCustomScheme(spec.scheme) ? 'Custom' : (SCHEME_META[spec.scheme]?.label ?? spec.scheme)}
              </span>
            </div>
            <div className="palette-grid" role="radiogroup" aria-label="Color scheme">
              {SCHEMES.map((s) => {
                const meta = SCHEME_META[s]
                const on = spec.scheme === s
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ scheme: s })}
                    className={'palette-pill' + (on ? ' on' : '')}
                  >
                    <span className="palette-bar">
                      {(meta?.swatches ?? ['#2a78d6']).map((hex, i) => (
                        <i key={i} style={{ background: hex }} />
                      ))}
                    </span>
                    <span className="truncate">{meta?.label ?? s}</span>
                  </button>
                )
              })}
              <button
                type="button"
                role="radio"
                aria-checked={isCustomScheme(spec.scheme)}
                onClick={() => {
                  if (!isCustomScheme(spec.scheme)) {
                    const base = SCHEME_META[spec.scheme]?.primary ?? '#2a78d6'
                    setActiveStop(0)
                    set({ scheme: base })
                  }
                }}
                className={'palette-pill' + (isCustomScheme(spec.scheme) ? ' on' : '')}
              >
                <span className="palette-wheel" />
                <span className="truncate">Custom…</span>
              </button>
            </div>

            {isCustomScheme(spec.scheme) && (() => {
              const stops = parseCustomColors(spec.scheme)
              const idx = Math.min(activeStop, stops.length - 1)
              const curHex = stops[idx] ?? '#2a78d6'
              const ramp = customScaleColors(spec.scheme)
              const updateStop = (i: number, hex: string) => {
                const next = stops.map((c, j) => (j === i ? hex : c))
                set({ scheme: next.join(',') })
              }
              const addStop = () => {
                if (stops.length >= 5) return
                const presets = ['#2563eb', '#0d9488', '#f59e0b', '#e11d48', '#7c3aed']
                const nextColor = presets.find((p) => !stops.includes(p)) ?? '#6366f1'
                const next = [...stops, nextColor]
                setActiveStop(next.length - 1)
                set({ scheme: next.join(',') })
              }
              const removeStop = (i: number) => {
                if (stops.length <= 1) return
                const next = stops.filter((_, j) => j !== i)
                setActiveStop(Math.max(0, Math.min(idx, next.length - 1)))
                set({ scheme: next.join(',') })
              }
              return (
                <div className="custom-palette-box">
                  <div
                    className="custom-palette-ramp"
                    style={{ background: `linear-gradient(90deg, ${ramp.join(', ')})` }}
                  />
                  <div className="custom-palette-row">
                    <div className="custom-stops">
                      {stops.map((hex, i) => (
                        <div key={i} className={'custom-stop-wrap' + (i === idx ? ' active' : '')}>
                          <label
                            className="custom-stop-circle"
                            style={{ background: hex }}
                            title={`Click to pick color ${i + 1} (${hex})`}
                            onClick={() => setActiveStop(i)}
                          >
                            <input
                              type="color"
                              value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#2a78d6'}
                              onChange={(e) => { setActiveStop(i); updateStop(i, e.target.value) }}
                            />
                          </label>
                          {stops.length > 1 && (
                            <button
                              type="button"
                              className="custom-stop-del"
                              aria-label={`Remove color ${i + 1}`}
                              onClick={() => removeStop(i)}
                            >
                              <X size={9} />
                            </button>
                          )}
                        </div>
                      ))}
                      {stops.length < 5 && (
                        <button
                          type="button"
                          className="custom-stop-add"
                          title="Add color stop (up to 5)"
                          onClick={addStop}
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                    <div className="custom-hex-box">
                      <Palette size={12} className="text-muted-foreground shrink-0" />
                      <input
                        type="text"
                        value={curHex}
                        maxLength={7}
                        aria-label="Hex color"
                        onChange={(e) => {
                          const v = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value
                          if (/^#[0-9a-fA-F]{3,6}$/.test(v)) updateStop(idx, v)
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
          {info.map && (
            <label className="design-row"><span>Basemap</span>
              <select className={field} value={spec.basemap} onChange={(e) => set({ basemap: e.target.value as Basemap })}>
                {(Object.keys(BASEMAPS) as Basemap[]).map((b) => <option key={b} value={b}>{BASEMAPS[b].label}</option>)}
              </select>
            </label>
          )}
        </section>
        </div>
      </div>
      <div className="dlg-preview">
        <p className="hint">Preview</p>
        <FigureView js={detached && !touched ? fig.js : js} params={activeParams} scenarios={fig.scenarios} />
        {activeParams.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <ParamSliders params={activeParams} onChange={setPreviewParam} idPrefix={'design-' + fig.id} grid={fig.scenarios?.grid} />
          </div>
        )}
      </div>
    </div>
  )
}

export type { Channel }
