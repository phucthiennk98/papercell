import { useEffect, useRef, useState } from 'react'
import { PlateElement, type PlateElementProps, useReadOnly } from 'platejs/react'
import { Settings2, SlidersHorizontal } from 'lucide-react'
import { paramValues, rerunForParam } from './run'
import type { ParamNode } from './types'

const decimals = (step: number) => (String(step).split('.')[1] ?? '').length
const fmt = (v: number, step: number) => v.toLocaleString('vi-VN', { minimumFractionDigits: decimals(step), maximumFractionDigits: decimals(step) })
const IDENT = /^[A-Za-z_]\w*$/

export function ParamElement(props: PlateElementProps) {
  const { editor } = props
  const node = props.element as unknown as ParamNode
  const readOnly = useReadOnly()
  const [value, setValue] = useState(node.value)
  const [config, setConfig] = useState(false)
  const timer = useRef<number>(0)
  useEffect(() => { setValue(node.value) }, [node.value])

  const set = (p: Partial<ParamNode>) => { const at = editor.api.findPath(props.element); if (at) editor.tf.setNodes(p, { at }) }

  // Kéo: cập nhật số ngay, chạy lại hình sau một nhịp ngắn; thả tay: chạy ngay.
  const change = (v: number, now = false) => {
    setValue(v)
    window.clearTimeout(timer.current)
    const go = () => { set({ value: v }); rerunForParam(editor, node.name) }
    if (now) go(); else timer.current = window.setTimeout(go, 160)
  }

  return (
    <PlateElement {...props} className={'pc-param' + (readOnly ? ' is-read' : '')}>
      <div contentEditable={false} className="pc-param-inner">
        <div className="pc-param-row">
          <SlidersHorizontal size={15} className="pc-param-icon" aria-hidden="true" />
          <label className="pc-param-label" htmlFor={'pr-' + node.id}>{node.label}</label>
          {!readOnly && <code className="pc-param-name">{node.name}</code>}
          <input id={'pr-' + node.id} type="range" min={node.min} max={node.max} step={node.step} value={value}
            onChange={(e) => change(+e.target.value)}
            onPointerUp={(e) => change(+(e.target as HTMLInputElement).value, true)}
            onKeyUp={(e) => { e.stopPropagation(); change(+(e.target as HTMLInputElement).value, true) }}
            onKeyDown={(e) => e.stopPropagation()} />
          <output className="pc-param-value">{fmt(value, node.step)}{node.unit ? ' ' + node.unit : ''}</output>
          {!readOnly && (
            <button type="button" className={'pc-icon-btn' + (config ? ' on' : '')} onClick={() => setConfig(!config)} aria-label="Cài đặt tham số" data-tip="Cài đặt tham số">
              <Settings2 size={15} strokeWidth={1.8} />
            </button>
          )}
        </div>
        {config && !readOnly && <ParamConfig node={node} onSave={(p) => { set(p); setConfig(false) }} taken={Object.keys(paramValues(editor)).filter((n) => n !== node.name)} />}
      </div>
      {props.children}
    </PlateElement>
  )
}

function ParamConfig({ node, onSave, taken }: { node: ParamNode; onSave: (p: Partial<ParamNode>) => void; taken: string[] }) {
  const [f, setF] = useState({ name: node.name, label: node.label, min: String(node.min), max: String(node.max), step: String(node.step), unit: node.unit ?? '' })
  const [err, setErr] = useState('')
  const field = (k: keyof typeof f, label: string, type = 'text') => (
    <label>{label}<input type={type} step="any" value={f[k]} onChange={(e) => { setF({ ...f, [k]: e.target.value }); setErr('') }} onKeyDown={(e) => e.stopPropagation()} /></label>
  )
  const save = () => {
    const min = +f.min, max = +f.max, step = +f.step
    if (!IDENT.test(f.name)) return setErr('Tên biến chỉ gồm chữ không dấu, số và dấu _, không bắt đầu bằng số.')
    if (taken.includes(f.name)) return setErr(`Tên "${f.name}" đã có tham số khác dùng.`)
    if (!(max > min)) return setErr('Giá trị lớn nhất phải lớn hơn nhỏ nhất.')
    if (!(step > 0)) return setErr('Bước phải lớn hơn 0.')
    onSave({ name: f.name, label: f.label.trim() || f.name, min, max, step, unit: f.unit, value: Math.min(max, Math.max(min, node.value)) })
  }
  return (
    <div className="pc-param-config">
      {field('name', 'Tên biến Python')}{field('label', 'Nhãn hiển thị')}{field('unit', 'Đơn vị')}
      {field('min', 'Nhỏ nhất', 'number')}{field('max', 'Lớn nhất', 'number')}{field('step', 'Bước', 'number')}
      <div className="pc-param-actions">
        {err && <span className="pc-err">{err}</span>}
        <button type="button" className="btn primary" onClick={save}>Lưu</button>
      </div>
    </div>
  )
}
