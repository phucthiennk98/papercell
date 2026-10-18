import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileUp, Loader2, Trash2, X } from 'lucide-react'
import { ACCEPT, asRows, describeColumns, importFile, isGeoJSON } from '@/data/import'
import type { DataFile } from '../editor/types'
import { DataContext, dataKey } from './runtime'

const size = (s: string) => { const b = new Blob([s]).size; return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.ceil(b / 1e3) + ' KB' }
const TYPE_LABEL = { number: 'number', date: 'date', text: 'text', lat: 'latitude', lon: 'longitude' } as const

/** Quản lý các file dữ liệu đính kèm bài viết, có xem trước. */
export function DataPanel({ onChange, onClose }: { onChange: (files: DataFile[]) => void; onClose: () => void }) {
  const { files, data } = useContext(DataContext)
  const input = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(() => files[0]?.name ?? '')
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose])

  const add = async (list: FileList | null) => {
    if (!list?.length) return
    setBusy(true); setMsg('')
    let next = [...files], last = ''
    const errors: string[] = []
    for (const f of Array.from(list)) {
      try { for (const d of await importFile(f)) { next = [...next.filter((x) => x.name !== d.name), d]; last = d.name } }
      catch (e) { errors.push(`${f.name}: ${(e as Error).message}`) }
    }
    onChange(next); if (last) setActive(last)
    setMsg(errors.join(' ')); setBusy(false)
  }

  const cur = files.find((f) => f.name === active)
  const curData = cur ? data[dataKey(cur.name)] : undefined
  const rows = useMemo(() => asRows(curData), [curData])
  const cols = useMemo(() => describeColumns(rows), [rows])
  /** Save a column's display name (empty = use the name from the file). */
  const setLabel = (col: string, value: string) => {
    if (!cur) return
    const labels = { ...(cur.labels ?? {}) }
    if (value.trim() && value.trim() !== col) labels[col] = value.trim(); else delete labels[col]
    if ((cur.labels?.[col] ?? '') === (labels[col] ?? '')) return
    onChange(files.map((f) => (f === cur ? { ...f, labels } : f)))
  }

  return createPortal(
    <div className="dlg-backdrop" onMouseDown={onClose}>
      <div className="dlg dlg-small" role="dialog" aria-modal="true" aria-label="Document data" onMouseDown={(e) => e.stopPropagation()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files) }}>
        <header className="dlg-head"><span className="dlg-title">Document data</span><button className="pc-icon-btn" aria-label="Close" onClick={onClose}><X size={17} /></button></header>
        <div className="dlg-body data-panel">
          <p className="hint">Load CSV, TXT, TSV, Excel (.xlsx), JSON or GeoJSON (or drop files here). JS code reads them as <code>data.name</code>, the original Python as <code>data["name"]</code>.</p>
          <table>
            <thead><tr><th>Variable</th><th>File</th><th>Contents</th><th>Size</th><th /></tr></thead>
            <tbody>
              {files.map((f) => {
                const v = data[dataKey(f.name)]
                return (
                  <tr key={f.name} className={f.name === active ? 'is-active' : ''} onClick={() => setActive(f.name)} style={{ cursor: 'pointer' }}>
                    <td><code>{dataKey(f.name)}</code></td><td>{f.name}</td>
                    <td>{isGeoJSON(v) ? `GeoJSON · ${asRows(v).length} features` : `${asRows(v).length.toLocaleString('en-US')} rows`}</td>
                    <td>{size(f.content)}</td>
                    <td><button className="pc-icon-btn" aria-label={'Delete ' + f.name} onClick={(e) => { e.stopPropagation(); onChange(files.filter((x) => x !== f)) }}><Trash2 size={14} /></button></td>
                  </tr>
                )
              })}
              {!files.length && <tr><td colSpan={5} className="hint">No files yet. Add files to share them across figures.</td></tr>}
            </tbody>
          </table>
          <div className="row">
            <button className="btn primary" onClick={() => input.current?.click()} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <FileUp size={14} />} Add files</button>
            <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
            {msg && <span className="pc-err">{msg}</span>}
          </div>
          {cur && cols.length > 0 && (
            <div className="data-preview">
              <div className="hint">Preview of <b>{cur.name}</b>: {cols.length} columns, first 8 rows. Type a <b>display name</b> under a column to use it in tables, axes and legends (empty = the name from the file).</div>
              <div className="data-preview-scroll">
                <table>
                  <thead><tr>{cols.map((c) => (
                    <th key={c.name}>{c.name}<span className="col-type">{TYPE_LABEL[c.type]}</span>
                      <input key={cur.name + c.name + (cur.labels?.[c.name] ?? '')} className="col-alias" defaultValue={cur.labels?.[c.name] ?? ''} placeholder="display name"
                        aria-label={`Display name for ${c.name}`} onBlur={(e) => setLabel(c.name, e.target.value)}
                        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur() }} />
                    </th>
                  ))}</tr></thead>
                  <tbody>{rows.slice(0, 8).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c.name}>{String(r[c.name] instanceof Date ? (r[c.name] as Date).toISOString().slice(0, 10) : r[c.name] ?? '')}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
