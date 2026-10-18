import { useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileUp, Trash2, X } from 'lucide-react'
import type { DataFile } from '../editor/types'
import { DataContext, dataKey } from './runtime'

const size = (s: string) => { const b = new Blob([s]).size; return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.ceil(b / 1e3) + ' KB' }
const rows = (v: unknown) => (Array.isArray(v) ? v.length.toLocaleString('vi-VN') + ' dòng' : v && typeof v === 'object' ? 'đối tượng JSON' : 'lỗi đọc file')

/** Quản lý các file dữ liệu đính kèm bài viết. */
export function DataPanel({ onChange, onClose }: { onChange: (files: DataFile[]) => void; onClose: () => void }) {
  const { files, data } = useContext(DataContext)
  const input = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose])

  const add = async (list: FileList | null) => {
    if (!list) return
    const next = [...files]
    for (const f of Array.from(list)) {
      const kind = /\.csv$/i.test(f.name) ? 'csv' : /\.(geo)?json$/i.test(f.name) ? 'json' : null
      if (!kind) { setMsg(`Bỏ qua ${f.name}: chỉ nhận CSV, JSON hoặc GeoJSON.`); continue }
      if (f.size > 5e6) { setMsg(`Bỏ qua ${f.name}: file lớn hơn 5 MB.`); continue }
      const i = next.findIndex((x) => x.name === f.name)
      const item: DataFile = { name: f.name, kind, content: await f.text() }
      if (i >= 0) next[i] = item; else next.push(item)
    }
    onChange(next)
  }

  return createPortal(
    <div className="dlg-backdrop" onMouseDown={onClose}>
      <div className="dlg dlg-small" role="dialog" aria-modal="true" aria-label="Dữ liệu của bài" onMouseDown={(e) => e.stopPropagation()}>
        <header className="dlg-head"><span className="dlg-title">Dữ liệu của bài</span><button className="pc-icon-btn" aria-label="Đóng" onClick={onClose}><X size={17} /></button></header>
        <div className="dlg-body data-panel">
          <p className="hint">Code JS đọc bằng <code>data.tên_file</code>, Python gốc đọc bằng <code>data["tên_file"]</code>. File được lưu kèm trong tài liệu.</p>
          <table>
            <thead><tr><th>Tên biến</th><th>File</th><th>Nội dung</th><th>Dung lượng</th><th /></tr></thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.name}>
                  <td><code>{dataKey(f.name)}</code></td><td>{f.name}</td><td>{rows(data[dataKey(f.name)])}</td><td>{size(f.content)}</td>
                  <td><button className="pc-icon-btn" aria-label={'Xóa ' + f.name} onClick={() => onChange(files.filter((x) => x !== f))}><Trash2 size={14} /></button></td>
                </tr>
              ))}
              {!files.length && <tr><td colSpan={5} className="hint">Chưa có file nào. Thêm file CSV hoặc JSON để các hình dùng chung.</td></tr>}
            </tbody>
          </table>
          <div className="row">
            <button className="btn primary" onClick={() => input.current?.click()}><FileUp size={14} /> Thêm file</button>
            <input ref={input} type="file" multiple accept=".csv,.json,.geojson" hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
            {msg && <span className="pc-err">{msg}</span>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
