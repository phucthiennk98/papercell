import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, Loader2, TriangleAlert } from 'lucide-react'
import { ACCEPT, asRows, describeColumns, importFile, isGeoJSON, type Column, type ColType } from '@/data/import'
import type { FigureNode, FigureParam } from '@/editor/types'
import { AGG_LABEL, CHART_TYPES, codegen, defaultSpec, SCHEMES, specParams, typeInfo, type Agg, type Channel, type ChartSpec, type ChartType } from './builder'
import { FigureView } from './FigureView'
import { BASEMAPS, type Basemap } from './map'
import { DataContext, dataKey } from './runtime'

const TYPE_BADGE: Record<ColType, string> = { number: 'số', date: 'ngày', text: 'chữ', lat: 'vĩ độ', lon: 'kinh độ' }

/** Tham số mới: giữ giá trị người dùng đã kéo nếu cùng tên. */
const mergeParams = (old: FigureParam[], fresh: FigureParam[]) => fresh.map((p) => ({ ...p, value: old.find((o) => o.name === p.name)?.value ?? p.value }))

export function DesignTab({ fig, onUpdate }: { fig: FigureNode; onUpdate: (p: Partial<FigureNode>) => void }) {
  const { files, data, setFiles } = useContext(DataContext)
  const keys = files.map((f) => dataKey(f.name))
  // Hình vừa chèn từ menu (chưa chọn dữ liệu): lấy bảng phù hợp đầu tiên; bản đồ vùng thì ưu tiên GeoJSON.
  const pick = (type: ChartType) => (type === 'map-regions' ? keys.find((k) => isGeoJSON(data[k])) : keys.find((k) => !isGeoJSON(data[k]))) ?? keys[0] ?? ''
  const [spec, setSpec] = useState<ChartSpec>(() => fig.spec ? { ...fig.spec, data: fig.spec.data || pick(fig.spec.type) } : defaultSpec(pick('bar')))
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)
  const [msg, setMsg] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const raw = data[spec.data]
  const columns = useMemo(() => describeColumns(asRows(raw)), [raw])
  const geo = isGeoJSON(raw)
  const info = typeInfo(spec.type)
  // Hình viết code tay (không tạo bằng Thiết kế) hoặc code đã sửa tay: Thiết kế chỉ xem trước, không ghi đè
  const detached = !!fig.specDetached || (!fig.spec && fig.js.trim() !== '')
  const js = codegen(spec)
  const params = mergeParams(fig.params, specParams(spec))

  // Tự điền cột vĩ độ/kinh độ cho bản đồ và lưu lựa chọn dữ liệu tự động ở trên
  useEffect(() => {
    // Chỉ cho hình tạo bằng Thiết kế; hình viết code tay không bao giờ bị ghi đè khi chỉ mở tab
    if (!fig.spec || detached) return
    if (!spec.data || (fig.spec?.data === spec.data && !(info.map && spec.type !== 'map-regions' && !spec.lat))) return
    const next = { ...spec }
    if (info.map) {
      next.lat ??= columns.find((c) => c.type === 'lat')?.name
      next.lon ??= columns.find((c) => c.type === 'lon')?.name
    }
    apply(next)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (next: ChartSpec, force = false) => {
    setSpec(next); setTouched(true)
    if (detached && !force) { if (fig.spec) onUpdate({ spec: next }); return }
    // Ghi đè code viết tay: giữ bản sao để còn quay lại
    const backup = detached ? { codeBackup: { js: fig.js, params: fig.params, spec: fig.spec, specDetached: fig.specDetached } } : {}
    onUpdate({ spec: next, js: codegen(next), params: mergeParams(fig.params, specParams(next)), specDetached: false, ...backup })
  }
  const restore = () => {
    const b = fig.codeBackup; if (!b) return
    onUpdate({ js: b.js, params: b.params, spec: b.spec, specDetached: b.specDetached, codeBackup: undefined })
    if (b.spec) setSpec(b.spec)
  }
  const set = (patch: Partial<ChartSpec>) => apply({ ...spec, ...patch })

  /** Đổi loại hình: tự điền cột vĩ độ/kinh độ nếu nhận ra. */
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
      if (first) apply({ ...spec, data: first, x: undefined, y: undefined, color: undefined, size: undefined, facet: undefined, lat: undefined, lon: undefined })
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  const colOptions = (allow?: (c: Column) => boolean) => columns.filter((c) => !allow || allow(c))
  const field = 'h-8 w-full rounded-md border bg-background px-2 text-[13px] outline-none focus:border-ring'

  return (
    <div className="dlg-design">
      <div className="dlg-design-form">
        <section>
          <h3>Dữ liệu</h3>
          <div className="flex gap-2">
            <select className={field} value={spec.data} onChange={(e) => apply({ ...defaultSpec(e.target.value), type: spec.type, scheme: spec.scheme, basemap: spec.basemap })} aria-label="Chọn bảng dữ liệu">
              {!keys.length && <option value="">Chưa có dữ liệu</option>}
              {keys.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <button className="btn shrink-0" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <FileUp size={14} />}Nạp file
            </button>
            <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { load(e.target.files); e.target.value = '' }} />
          </div>
          <p className="hint">CSV, TXT, TSV, Excel (.xlsx), JSON, GeoJSON. {raw ? `${geo ? 'GeoJSON' : 'Bảng'} · ${asRows(raw).length.toLocaleString('vi-VN')} dòng · ${columns.length} cột` : ''}</p>
          {msg && <p className="pc-err">{msg}</p>}
        </section>

        <section>
          <h3>Loại biểu đồ</h3>
          <div className="type-grid" role="radiogroup" aria-label="Loại biểu đồ">
            {CHART_TYPES.map((t) => {
              const disabled = t.type === 'map-regions' && !geo
              return (
                <button key={t.type} role="radio" aria-checked={spec.type === t.type} disabled={disabled}
                  title={disabled ? 'Cần dữ liệu GeoJSON có vùng (polygon)' : t.label}
                  className={'type-btn' + (spec.type === t.type ? ' on' : '')} onClick={() => chooseType(t.type)}>
                  <t.icon size={18} strokeWidth={1.7} /><span>{t.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <h3>Cột</h3>
          {info.channels.map((c) => (
            <label key={c.channel} className="design-row">
              <span>{c.label}{c.required && <b className="req">*</b>}</span>
              <select className={field} value={spec[c.channel] ?? ''} onChange={(e) => set({ [c.channel]: e.target.value || undefined } as Partial<ChartSpec>)}>
                <option value="">{c.hint ? `— ${c.hint} —` : '— không —'}</option>
                {colOptions(c.channel === 'lat' || c.channel === 'lon' || c.channel === 'size' ? (col) => col.type !== 'text' && col.type !== 'date' : undefined).map((col) => (
                  <option key={col.name} value={col.name}>{col.name} · {TYPE_BADGE[col.type]}</option>
                ))}
              </select>
            </label>
          ))}
          {info.agg && (
            <label className="design-row"><span>Gộp giá trị</span>
              <select className={field} value={spec.agg} onChange={(e) => set({ agg: e.target.value as Agg })}>
                {(Object.keys(AGG_LABEL) as Agg[]).filter((a) => a !== 'none' || spec.type === 'line' || spec.type === 'area').map((a) => <option key={a} value={a}>{AGG_LABEL[a]}</option>)}
              </select>
            </label>
          )}
          {info.sort && (
            <label className="design-row"><span>Sắp xếp</span>
              <select className={field} value={spec.sort} onChange={(e) => set({ sort: e.target.value as ChartSpec['sort'] })}>
                <option value="none">Theo dữ liệu</option><option value="desc">Giảm dần</option><option value="asc">Tăng dần</option>
              </select>
            </label>
          )}
          {info.bins && <p className="hint">Số cột của histogram là một thanh trượt; người đọc kéo được.</p>}
        </section>

        <section>
          <h3>Hiển thị</h3>
          {!info.map && spec.type !== 'table' && <>
            <label className="design-row"><span>Nhãn trục X</span><input className={field} value={spec.xLabel ?? ''} placeholder="tự động" onChange={(e) => set({ xLabel: e.target.value || undefined })} /></label>
            <label className="design-row"><span>Nhãn trục Y</span><input className={field} value={spec.yLabel ?? ''} placeholder="tự động" onChange={(e) => set({ yLabel: e.target.value || undefined })} /></label>
          </>}
          <label className="design-row"><span>Bảng màu</span>
            <select className={field} value={spec.scheme} onChange={(e) => set({ scheme: e.target.value })}>{SCHEMES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </label>
          {info.map && (
            <label className="design-row"><span>Bản đồ nền</span>
              <select className={field} value={spec.basemap} onChange={(e) => set({ basemap: e.target.value as Basemap })}>
                {(Object.keys(BASEMAPS) as Basemap[]).map((b) => <option key={b} value={b}>{BASEMAPS[b].label}</option>)}
              </select>
            </label>
          )}
        </section>

        {detached && (
          <div className="detached">
            <TriangleAlert size={16} />
            <div>
              <b>{fig.spec ? 'Code JS đã được sửa tay.' : 'Hình này viết bằng code.'}</b> Chọn ở đây chỉ để xem trước, chưa áp vào hình.
              <button className="btn" onClick={() => apply(spec, true)}>Dùng thiết kế này (thay code, vẫn quay lại được)</button>
            </div>
          </div>
        )}
        {fig.codeBackup && !detached && (
          <div className="detached">
            <TriangleAlert size={16} />
            <div>
              Code viết tay trước đó đã được thay bằng thiết kế này.
              <button className="btn" onClick={restore}>Quay lại code cũ</button>
            </div>
          </div>
        )}
      </div>
      <div className="dlg-preview">
        <p className="hint">Xem trước</p>
        <FigureView js={detached && !touched ? fig.js : js} params={detached && !touched ? fig.params : params} scenarios={fig.scenarios} />
      </div>
    </div>
  )
}

export type { Channel }
