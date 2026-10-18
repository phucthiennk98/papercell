import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { paramKind, type FigureParam, type ParamValue } from '../editor/types'
import { DataContext, labelsOf, runFigure } from './runtime'
import { snap, type GridAxis, type ScenarioCache } from './scenarios'

/** Vẽ một hình từ code JS; tự vẽ lại khi code, tham số, dữ liệu hoặc độ rộng thay đổi. */
export function FigureView({ js, params, scenarios, className, onError }: { js: string; params: FigureParam[]; scenarios?: ScenarioCache; className?: string; onError?: (e: string | null) => void }) {
  const { data, files } = useContext(DataContext)
  const labels = useMemo(() => labelsOf(files), [files])
  const box = useRef<HTMLDivElement>(null)
  const out = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(params.map((p) => [p.name, p.value]))

  useEffect(() => {
    const el = box.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.round(e.contentRect.width / 10) * 10)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!width) return
    let alive = true
    runFigure(js, params, data, width, scenarios, labels).then((r) => {
      // Lần vẽ đã bị thay bằng lần mới: giải phóng ngay bản đồ vừa tạo, nếu không mỗi lần
      // vẽ lại sẽ giữ một ngữ cảnh WebGL; trình duyệt chỉ cho ~16 cái rồi bắt đầu tắt bản đồ (ô đen).
      if (!alive || !out.current) { releaseNode(r.node); return }
      // Giải phóng bản đồ cũ (WebGL) trước khi vẽ lại
      out.current.querySelectorAll('*').forEach((el) => (el as any).__pcCleanup?.())
      out.current.replaceChildren()
      if (r.node) out.current.append(r.node)
      else if (r.html) out.current.innerHTML = r.html
      setError(r.error); onError?.(r.error)
    })
    return () => { alive = false }
  }, [js, key, data, width, scenarios?.payload, labels])

  useEffect(() => () => { out.current?.querySelectorAll('*').forEach((el) => (el as any).__pcCleanup?.()) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={box} className={'fig-view ' + (className ?? '')}>
      <div ref={out} className="fig-out" />
      {error && <pre className="fig-error">{error}</pre>}
    </div>
  )
}

/** Gọi __pcCleanup cho phần tử và mọi phần tử con (bản đồ MapLibre giải phóng WebGL). */
function releaseNode(n: Node | null) {
  if (!(n instanceof Element)) return
  ;(n as any).__pcCleanup?.()
  n.querySelectorAll('*').forEach((el) => (el as any).__pcCleanup?.())
}

const decimals = (step: number) => (String(step).split('.')[1] ?? '').length
export const fmtParam = (p: FigureParam) =>
  (typeof p.value === 'number' ? p.value.toLocaleString('en-US', { minimumFractionDigits: decimals(p.step), maximumFractionDigits: decimals(p.step) }) : String(p.value)) + (p.unit ? ' ' + p.unit : '')

/** Các thanh trượt của một hình. */
export function ParamSliders({ params, onChange, onCommit, idPrefix, large, grid }: {
  params: FigureParam[]; onChange: (name: string, v: ParamValue) => void; onCommit?: () => void; idPrefix: string; large?: boolean
  /** Có kết quả tính sẵn: thanh trượt bắt vào đúng các điểm đã tính. */
  grid?: GridAxis[]
}) {
  if (!params.length) return null
  return (
    <div className={'fig-params' + (large ? ' is-large' : '')}>
      {params.map((p) => {
        const id = `${idPrefix}-${p.name}`
        const kind = paramKind(p)
        // Choosing a dropdown option or flipping a switch is a complete change: commit right away
        const pick = (v: ParamValue) => { onChange(p.name, v); setTimeout(() => onCommit?.(), 0) }
        return (
          <div key={p.name} className={'fig-param is-' + kind}>
            <label htmlFor={id}>{p.label}</label>
            {kind === 'radio' ? (
              <div id={id} className="pc-radio" role="radiogroup" aria-label={p.label}>
                {(p.options ?? []).map((o) => (
                  <button key={String(o)} type="button" role="radio" aria-checked={String(o) === String(p.value)}
                    className={String(o) === String(p.value) ? 'on' : ''} onClick={() => pick(o)} onKeyDown={(e) => e.stopPropagation()}>
                    <i />{String(o)}{p.unit ? ' ' + p.unit : ''}
                  </button>
                ))}
              </div>
            ) : kind === 'select' ? (
              <select id={id} value={String(p.value)} onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => { const o = (p.options ?? []).find((x) => String(x) === e.target.value); pick(o ?? e.target.value) }}>
                {(p.options ?? []).map((o) => <option key={String(o)} value={String(o)}>{String(o)}{p.unit ? ' ' + p.unit : ''}</option>)}
              </select>
            ) : kind === 'toggle' ? (
              <button id={id} type="button" role="switch" aria-checked={!!p.value} className={'pc-switch' + (p.value ? ' on' : '')}
                onClick={() => pick(!p.value)} onKeyDown={(e) => e.stopPropagation()}><i /></button>
            ) : (
              <input id={id} type="range" min={p.min} max={p.max} step={p.step} value={Number(p.value)}
                onChange={(e) => onChange(p.name, grid ? snap(grid, p.name, +e.target.value) : +e.target.value)} onPointerUp={onCommit} onKeyUp={(e) => { e.stopPropagation(); onCommit?.() }}
                onKeyDown={(e) => e.stopPropagation()} />
            )}
            {kind === 'range' ? <output>{fmtParam(p)}</output> : kind === 'toggle' ? <output>{p.value ? 'on' : 'off'}</output> : <span />}
          </div>
        )
      })}
    </div>
  )
}
