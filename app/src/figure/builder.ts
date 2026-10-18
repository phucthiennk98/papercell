// Trình tạo biểu đồ không cần code: chọn loại hình và các cột → sinh code Plot dễ đọc.
import {
  AreaChart, ChartColumn, ChartLine, ChartScatter, ChartNoAxesColumn, BarChartHorizontal, Box, Grid3x3, Table2, MapPin, Flame, Map as MapIcon,
  type LucideIcon,
} from 'lucide-react'
import type { Basemap } from './map'

export type ChartType = 'bar' | 'barh' | 'line' | 'area' | 'scatter' | 'histogram' | 'box' | 'heatmap' | 'table' | 'map-points' | 'map-heat' | 'map-regions'
export type Agg = 'none' | 'count' | 'sum' | 'mean' | 'median' | 'min' | 'max'
export type Channel = 'x' | 'y' | 'color' | 'size' | 'facet' | 'lat' | 'lon'

export type ChartSpec = {
  data: string
  type: ChartType
  x?: string; y?: string; color?: string; size?: string; facet?: string; lat?: string; lon?: string
  agg: Agg
  bins: number
  sort: 'none' | 'asc' | 'desc'
  xLabel?: string; yLabel?: string
  scheme: string
  basemap: Basemap
}

type ChannelInfo = { channel: Channel; label: string; required?: boolean; hint?: string }
export type ChartTypeInfo = { type: ChartType; label: string; icon: LucideIcon; channels: ChannelInfo[]; agg?: boolean; bins?: boolean; sort?: boolean; map?: boolean }

const C = (channel: Channel, label: string, required = false, hint?: string): ChannelInfo => ({ channel, label, required, hint })

export const CHART_TYPES: ChartTypeInfo[] = [
  { type: 'bar', label: 'Cột', icon: ChartColumn, agg: true, sort: true, channels: [C('x', 'Nhóm (trục X)', true), C('y', 'Giá trị (trục Y)', false, 'để trống thì đếm số dòng'), C('color', 'Màu theo'), C('facet', 'Chia ô theo')] },
  { type: 'barh', label: 'Thanh ngang', icon: BarChartHorizontal, agg: true, sort: true, channels: [C('y', 'Nhóm (trục Y)', true), C('x', 'Giá trị (trục X)', false, 'để trống thì đếm số dòng'), C('color', 'Màu theo')] },
  { type: 'line', label: 'Đường', icon: ChartLine, agg: true, channels: [C('x', 'Trục X (thời gian/số)', true), C('y', 'Trục Y', true), C('color', 'Mỗi đường một màu theo'), C('facet', 'Chia ô theo')] },
  { type: 'area', label: 'Vùng', icon: AreaChart, agg: true, channels: [C('x', 'Trục X', true), C('y', 'Trục Y', true), C('color', 'Chồng vùng theo')] },
  { type: 'scatter', label: 'Phân tán', icon: ChartScatter, channels: [C('x', 'Trục X', true), C('y', 'Trục Y', true), C('color', 'Màu theo'), C('size', 'Cỡ điểm theo'), C('facet', 'Chia ô theo')] },
  { type: 'histogram', label: 'Histogram', icon: ChartNoAxesColumn, bins: true, channels: [C('x', 'Biến số', true), C('color', 'Màu theo'), C('facet', 'Chia ô theo')] },
  { type: 'box', label: 'Hộp (box)', icon: Box, channels: [C('y', 'Giá trị', true), C('x', 'Nhóm')] },
  { type: 'heatmap', label: 'Bản đồ nhiệt ô', icon: Grid3x3, agg: true, channels: [C('x', 'Cột', true), C('y', 'Hàng', true), C('color', 'Giá trị tô màu', false, 'để trống thì đếm số dòng')] },
  { type: 'table', label: 'Bảng', icon: Table2, agg: true, channels: [C('x', 'Gộp nhóm theo', false, 'để trống thì hiện các dòng đầu'), C('y', 'Cột giá trị')] },
  { type: 'map-points', label: 'Bản đồ điểm', icon: MapPin, map: true, channels: [C('lat', 'Vĩ độ', true), C('lon', 'Kinh độ', true), C('color', 'Màu theo'), C('size', 'Cỡ điểm theo')] },
  { type: 'map-heat', label: 'Bản đồ nhiệt', icon: Flame, map: true, channels: [C('lat', 'Vĩ độ', true), C('lon', 'Kinh độ', true), C('size', 'Trọng số')] },
  { type: 'map-regions', label: 'Tô màu vùng', icon: MapIcon, map: true, channels: [C('color', 'Tô màu theo thuộc tính')] },
]

export const AGG_LABEL: Record<Agg, string> = { none: 'Giữ nguyên', count: 'Đếm', sum: 'Tổng', mean: 'Trung bình', median: 'Trung vị', min: 'Nhỏ nhất', max: 'Lớn nhất' }
export const SCHEMES = ['blues', 'greens', 'oranges', 'reds', 'purples', 'viridis', 'turbo', 'ylorrd'] as const

export const typeInfo = (t: ChartType) => CHART_TYPES.find((c) => c.type === t)!

export const defaultSpec = (data = ''): ChartSpec => ({ data, type: 'bar', agg: 'count', bins: 20, sort: 'none', scheme: 'blues', basemap: 'light' })

/** Thiếu cột bắt buộc nào thì trả về tên để báo người dùng. */
export function missingChannels(s: ChartSpec) {
  return typeInfo(s.type).channels.filter((c) => c.required && !s[c.channel]).map((c) => c.label)
}

const q = (s?: string) => JSON.stringify(s ?? '')
const prop = (s: string) => /^[A-Za-z_$][\w$]*$/.test(s) ? `d.${s}` : `d[${q(s)}]`

/** Sinh code JS (Observable Plot hoặc bản đồ MapLibre) từ lựa chọn. */
export function codegen(s: ChartSpec): string {
  const info = typeInfo(s.type)
  const head = `// Tạo bằng trình tạo biểu đồ (tab Thiết kế). Sửa ở đây thì Thiết kế sẽ không cập nhật code nữa.
const ds = data[${q(s.data)}] ?? []`
  if (!s.data) return `return "<p>Chọn dữ liệu ở tab Thiết kế.</p>"`
  const miss = missingChannels(s)
  if (miss.length) return `${head}\nreturn "<p>Chọn cột cho: ${miss.join(', ')}.</p>"`

  if (info.map) {
    const opts = [`data: ds`, `kind: ${q(s.type === 'map-points' ? 'points' : s.type === 'map-heat' ? 'heat' : 'regions')}`,
      s.lat && `lat: ${q(s.lat)}`, s.lon && `lon: ${q(s.lon)}`, s.color && `color: ${q(s.color)}`, s.size && `size: ${q(s.size)}`,
      `scheme: ${q(s.scheme)}`, `basemap: ${q(s.basemap)}`, `width`].filter(Boolean)
    return `${head}\nexpose(Array.isArray(ds) ? ds.length : ds.features?.length)\nreturn pc.map({\n  ${opts.join(',\n  ')},\n})`
  }

  if (s.type === 'table') {
    if (!s.x) return `${head}
expose(ds.length)
const cot = Object.keys(ds[0] ?? {})
return \`<table class="fig-table"><thead><tr>\${cot.map((c) => \`<th>\${pc.esc(c)}</th>\`).join("")}</tr></thead>
<tbody>\${ds.slice(0, 50).map((d) => \`<tr>\${cot.map((c) => \`<td>\${pc.esc(d[c])}</td>\`).join("")}</tr>\`).join("")}</tbody></table>\``
    const fn = s.agg === 'count' || !s.y ? 'v.length' : `d3.${s.agg === 'none' ? 'sum' : s.agg}(v, (d) => ${prop(s.y)})`
    const head2 = s.agg === 'count' || !s.y ? 'Số dòng' : `${AGG_LABEL[s.agg === 'none' ? 'sum' : s.agg]} ${s.y}`
    return `${head}
const bang = d3.rollups(ds, (v) => ${fn}, (d) => ${prop(s.x)})${s.sort === 'desc' ? '.sort((a, b) => b[1] - a[1])' : s.sort === 'asc' ? '.sort((a, b) => a[1] - b[1])' : ''}
expose(bang)
return \`<table class="fig-table"><thead><tr><th>\${pc.esc(${q(s.x)})}</th><th>\${pc.esc(${q(head2)})}</th></tr></thead>
<tbody>\${bang.map(([k, v]) => \`<tr><td>\${pc.esc(k)}</td><td>\${typeof v === "number" ? v.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) : v}</td></tr>\`).join("")}</tbody></table>\``
  }

  const facet = s.facet ? `fy: ${q(s.facet)}` : ''
  const color = (key: 'fill' | 'stroke') => (s.color ? `${key}: ${q(s.color)}` : `${key}: "#2a78d6"`)
  const join = (...xs: string[]) => xs.filter(Boolean).join(', ')
  const agg = s.agg === 'none' ? 'sum' : s.agg
  let marks = ''
  let extra: string[] = []
  switch (s.type) {
    case 'bar': {
      const reducer = !s.y || s.agg === 'count' ? `{ y: "count" }` : `{ y: ${q(agg)} }`
      const sortOpt = s.sort === 'none' ? '' : `sort: { x: ${q(s.sort === 'desc' ? '-y' : 'y')} }`
      marks = `Plot.barY(ds, Plot.groupX(${reducer}, { ${join(`x: ${q(s.x)}`, s.y && s.agg !== 'count' ? `y: ${q(s.y)}` : '', color('fill'), facet, sortOpt, 'tip: true')} })),\n    Plot.ruleY([0])`
      break
    }
    case 'barh': {
      const reducer = !s.x || s.agg === 'count' ? `{ x: "count" }` : `{ x: ${q(agg)} }`
      const sortOpt = s.sort === 'none' ? '' : `sort: { y: ${q(s.sort === 'desc' ? '-x' : 'x')} }`
      marks = `Plot.barX(ds, Plot.groupY(${reducer}, { ${join(`y: ${q(s.y)}`, s.x && s.agg !== 'count' ? `x: ${q(s.x)}` : '', color('fill'), sortOpt, 'tip: true')} })),\n    Plot.ruleX([0])`
      extra = ['marginLeft: lechTrai']
      break
    }
    case 'line':
    case 'area': {
      const mark = s.type === 'line' ? 'lineY' : 'areaY'
      const key = s.type === 'line' ? 'stroke' : 'fill'
      const opts = join(`x: ${q(s.x)}`, `y: ${q(s.y)}`, s.color ? `${key}: ${q(s.color)}` : `${key}: "#2a78d6"`, facet, 'tip: true')
      // Đường nối điểm theo thứ tự dữ liệu: sắp theo trục X trước, nếu không sẽ thành hình zíc zắc
      marks = s.agg === 'none' ? `Plot.${mark}(theoX, { ${opts} })` : `Plot.${mark}(theoX, Plot.groupX({ y: ${q(agg === 'count' ? 'count' : agg)} }, { ${opts} }))`
      if (s.type === 'area') marks += ',\n    Plot.ruleY([0])'
      break
    }
    case 'scatter':
      marks = `Plot.dot(ds, { ${join(`x: ${q(s.x)}`, `y: ${q(s.y)}`, color('fill'), s.size ? `r: ${q(s.size)}` : 'r: 3', facet, 'fillOpacity: 0.7', 'tip: true')} })`
      break
    case 'histogram':
      marks = `Plot.rectY(ds, Plot.binX({ y: "count" }, { ${join(`x: ${q(s.x)}`, color('fill'), facet, 'thresholds: so_cot', 'tip: true')} })),\n    Plot.ruleY([0])`
      break
    case 'box':
      marks = `Plot.boxY(ds, { ${join(s.x ? `x: ${q(s.x)}` : '', `y: ${q(s.y)}`)} })`
      break
    case 'heatmap': {
      const reducer = !s.color || s.agg === 'count' ? `{ fill: "count" }` : `{ fill: ${q(agg)} }`
      marks = `Plot.cell(ds, Plot.group(${reducer}, { ${join(`x: ${q(s.x)}`, `y: ${q(s.y)}`, s.color && s.agg !== 'count' ? `fill: ${q(s.color)}` : '', 'tip: true')} }))`
      extra = [`color: { scheme: ${q(s.scheme)}, legend: true }`, 'marginLeft: lechTrai']
      break
    }
  }
  // Màu: cột số thì dùng thang màu đã chọn, cột chữ (nhóm) thì dùng bảng màu phân biệt rõ
  const colorLegend = s.color && s.type !== 'heatmap'
    ? [`color: { legend: true, scheme: typeof ds.find((d) => d[${q(s.color)}] != null)?.[${q(s.color)}] === "number" ? ${q(s.scheme)} : "tableau10" }`] : []
  // Trục số hiển thị kiểu Việt Nam: 10.000 và 0,5
  const vn = 'tickFormat: (d) => typeof d === "number" ? d.toLocaleString("vi-VN") : d instanceof Date ? d.toLocaleDateString("vi-VN") : d'
  const xNumeric = s.type === 'barh' || s.type === 'scatter' || s.type === 'histogram' || s.type === 'line' || s.type === 'area'
  const yNumeric = s.type !== 'barh' && s.type !== 'heatmap'
  // Trục X là nhóm chữ: nhãn dài thì xoay nghiêng cho khỏi chồng lên nhau
  const xCat = (s.type === 'bar' || s.type === 'box' || s.type === 'heatmap') && !!s.x
  const yCat = s.type === 'barh' || s.type === 'heatmap'
  const pre = [
    yCat ? `const lechTrai = Math.min(220, 16 + 6.5 * (d3.max(ds, (d) => String(d[${q(s.y)}] ?? "").length) ?? 0))` : '',
    // Nhãn trục X quá dài so với chỗ trống thì xoay nghiêng
    xCat ? `const nhanX = d3.max(ds, (d) => String(d[${q(s.x)}] ?? "").length) ?? 0
const xoay = nhanX * 7.5 * new Set(ds.map((d) => d[${q(s.x)}])).size > width - ${yCat ? 'lechTrai - 20' : '80'}` : '',
    s.type === 'line' || s.type === 'area' ? `const theoX = d3.sort(ds, (d) => d[${q(s.x)}])` : '',
    s.facet ? `const soO = new Set(ds.map((d) => d[${q(s.facet)}])).size` : '',
  ].filter(Boolean)
  const xOpts = [s.xLabel ? `label: ${q(s.xLabel)}` : '', xNumeric ? vn : '', xCat ? 'tickRotate: xoay ? -35 : 0' : ''].filter(Boolean)
  const axes = [
    xOpts.length ? `x: { ${xOpts.join(', ')} }` : '',
    `y: { grid: true${s.yLabel ? `, label: ${q(s.yLabel)}` : ''}${yNumeric ? `, ${vn}` : ''} }`,
    s.facet ? 'fy: { label: null }' : '',
  ].filter(Boolean)
  const layout = [
    s.facet ? 'height: Math.max(320, 120 * soO)' : 'height: 320',
    xCat ? 'marginBottom: xoay ? Math.min(130, 24 + 4.2 * nhanX) : 30' : '',
    xCat && !yCat ? 'marginLeft: xoay ? Math.max(50, Math.min(120, 5.2 * nhanX)) : 50' : '',
    s.facet ? `marginRight: Math.min(200, 16 + 6.5 * d3.max(ds, (d) => String(d[${q(s.facet)}] ?? "").length))` : '',
  ].filter(Boolean)
  return `${head}
${pre.length ? pre.join('\n') + '\n' : ''}expose(ds.length)
return Plot.plot({
  width,
  ${[...layout, ...extra, ...colorLegend, ...axes].join(',\n  ')},
  marks: [
    ${marks},
  ],
})`
}

/** Các tham số (thanh trượt) mà loại hình này cần. */
export function specParams(s: ChartSpec) {
  return s.type === 'histogram' ? [{ name: 'so_cot', label: 'Số cột', min: 5, max: 80, step: 1, value: s.bins }] : []
}
