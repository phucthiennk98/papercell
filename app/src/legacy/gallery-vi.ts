// Legacy Vietnamese chart gallery snapshot: kept solely so upgrade.ts can restore figures in documents created before the UI moved to English.
// Legacy "Chart gallery" document with seeded synthetic datasets.
// All values are deterministic synthetic data, NOT real-world measurements.
import type { DataFile, FigureNode, PapercellDoc } from '@/editor/types'
import { codegen, defaultSpec, specParams, type ChartSpec } from '@/figure/builder'
import { FIGURE_TEMPLATES, figureFromTemplate } from '@/figure/templates'

function mulberry32(a: number) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

// Provinces/cities: name, region, approximate coordinates, and synthetic population (thousands).
const TINH: [string, string, number, number, number][] = [
  ['Hà Nội', 'Đồng bằng sông Hồng', 21.03, 105.85, 8400], ['Hải Phòng', 'Đồng bằng sông Hồng', 20.86, 106.68, 2100],
  ['Bắc Ninh', 'Đồng bằng sông Hồng', 21.18, 106.07, 1500], ['Nam Định', 'Đồng bằng sông Hồng', 20.43, 106.18, 1880],
  ['Thái Bình', 'Đồng bằng sông Hồng', 20.45, 106.34, 1870], ['Quảng Ninh', 'Đồng bằng sông Hồng', 20.95, 107.08, 1360],
  ['Lào Cai', 'Trung du miền núi phía Bắc', 22.48, 103.97, 770], ['Thái Nguyên', 'Trung du miền núi phía Bắc', 21.59, 105.85, 1330],
  ['Lạng Sơn', 'Trung du miền núi phía Bắc', 21.85, 106.76, 800], ['Điện Biên', 'Trung du miền núi phía Bắc', 21.39, 103.02, 640],
  ['Thanh Hóa', 'Bắc Trung Bộ', 19.81, 105.78, 3720], ['Nghệ An', 'Bắc Trung Bộ', 18.67, 105.69, 3420],
  ['Huế', 'Bắc Trung Bộ', 16.46, 107.59, 1160], ['Quảng Bình', 'Bắc Trung Bộ', 17.47, 106.62, 910],
  ['Đà Nẵng', 'Duyên hải Nam Trung Bộ', 16.05, 108.2, 1220], ['Quảng Nam', 'Duyên hải Nam Trung Bộ', 15.57, 108.47, 1520],
  ['Bình Định', 'Duyên hải Nam Trung Bộ', 13.78, 109.22, 1500], ['Khánh Hòa', 'Duyên hải Nam Trung Bộ', 12.24, 109.19, 1260],
  ['Đắk Lắk', 'Tây Nguyên', 12.67, 108.04, 1930], ['Lâm Đồng', 'Tây Nguyên', 11.94, 108.44, 1330],
  ['Gia Lai', 'Tây Nguyên', 13.98, 108.0, 1590], ['TP Hồ Chí Minh', 'Đông Nam Bộ', 10.78, 106.7, 9400],
  ['Bình Dương', 'Đông Nam Bộ', 11.0, 106.65, 2760], ['Đồng Nai', 'Đông Nam Bộ', 10.95, 106.82, 3250],
  ['Bà Rịa - Vũng Tàu', 'Đông Nam Bộ', 10.35, 107.08, 1180], ['Cần Thơ', 'Đồng bằng sông Cửu Long', 10.03, 105.78, 1250],
  ['An Giang', 'Đồng bằng sông Cửu Long', 10.52, 105.13, 1900], ['Kiên Giang', 'Đồng bằng sông Cửu Long', 10.0, 105.08, 1750],
  ['Cà Mau', 'Đồng bằng sông Cửu Long', 9.18, 105.15, 1200], ['Long An', 'Đồng bằng sông Cửu Long', 10.54, 106.41, 1730],
]
const VUNG = [...new Set(TINH.map((t) => t[1]))]
const PHUONG_TIEN = ['Xe máy', 'Ô tô', 'Xe buýt', 'Đi bộ', 'Xe đạp', 'Gọi xe công nghệ']
const NHOM_TUOI = ['18–24', '25–34', '35–44', '45–54', '55+']

function makeData(): DataFile[] {
  const rnd = mulberry32(42)
  const normal = (m: number, s: number) => m + s * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())
  const pick = <T,>(xs: T[], w?: number[]) => {
    if (!w) return xs[Math.floor(rnd() * xs.length)]
    let r = rnd() * w.reduce((a, b) => a + b, 0)
    for (let i = 0; i < xs.length; i++) { r -= w[i]; if (r <= 0) return xs[i] }
    return xs[xs.length - 1]
  }

  // 1. Provinces/cities
  const tinh = TINH.map(([ten, vung, lat, lon, dan_so]) => {
    const do_thi = Math.min(0.95, Math.max(0.12, 0.2 + dan_so / 12000 + normal(0, 0.08)))
    return { ten, vung, lat, lon, dan_so, ty_le_do_thi: +do_thi.toFixed(2), thu_nhap: +(4 + 9 * do_thi + normal(0, 0.8)).toFixed(1) }
  })

  // 2. Monthly series 2023–2025 per region with upward trend, Tet seasonality, and noise
  const thang: string[] = ['thang,vung,chi_tieu,giao_dich']
  VUNG.forEach((v, k) => {
    const base = 40 + 12 * k
    for (let i = 0; i < 36; i++) {
      const d = new Date(Date.UTC(2023, i, 1)).toISOString().slice(0, 10)
      const mua = i % 12 === 0 || i % 12 === 1 ? 1.25 : 1
      const chi = base * (1 + 0.012 * i) * mua + normal(0, 3)
      thang.push([d, v, chi.toFixed(1), Math.round(chi * (18 + normal(0, 1.5)))].join(','))
    }
  })

  // 3. Travel behavior survey: 1,500 respondents jittered around home province coordinates
  const ks: string[] = ['id,tinh,vung,lat,lon,tuoi,nhom_tuoi,gioi,thu_nhap,phuong_tien,so_chuyen_tuan,thoi_gian_phut,diem_hai_long']
  const wTinh = tinh.map((t) => t.dan_so)
  for (let i = 0; i < 1500; i++) {
    const t = pick(tinh, wTinh)
    const tuoi = Math.round(Math.min(75, Math.max(18, normal(37, 12))))
    const nhom = tuoi < 25 ? NHOM_TUOI[0] : tuoi < 35 ? NHOM_TUOI[1] : tuoi < 45 ? NHOM_TUOI[2] : tuoi < 55 ? NHOM_TUOI[3] : NHOM_TUOI[4]
    const thu = Math.max(2, Math.exp(normal(Math.log(t.thu_nhap), 0.45)))
    const pt = pick(PHUONG_TIEN, [60, 6 + thu * 1.2, 8 * t.ty_le_do_thi, 6, 4, 5 + 10 * t.ty_le_do_thi * (tuoi < 35 ? 1.5 : 0.6)])
    const tg = Math.max(5, normal({ 'Xe máy': 25, 'Ô tô': 35, 'Xe buýt': 48, 'Đi bộ': 15, 'Xe đạp': 20, 'Gọi xe công nghệ': 28 }[pt]!, 9))
    const diem = Math.round(Math.min(10, Math.max(1, normal(7.5 - tg / 25 + (pt === 'Ô tô' ? 0.6 : 0), 1.4))))
    ks.push([i + 1, t.ten, t.vung, (t.lat + normal(0, 0.12)).toFixed(4), (t.lon + normal(0, 0.12)).toFixed(4), tuoi, nhom, rnd() < 0.5 ? 'Nam' : 'Nữ',
      thu.toFixed(1), pt, Math.max(1, Math.round(normal(9, 3))), tg.toFixed(0), diem].join(','))
  }

  // 4. 1° × 1° GeoJSON grid cells covering surveyed provinces
  const rows = ks.slice(1).map((r) => r.split(','))
  const cells = new Map<string, { n: number; tn: number }>()
  for (const r of rows) {
    const k = `${Math.floor(+r[3])},${Math.floor(+r[4])}`
    const c = cells.get(k) ?? { n: 0, tn: 0 }; c.n++; c.tn += +r[8]; cells.set(k, c)
  }
  const features = [...cells].map(([k, c]) => {
    const [la, lo] = k.split(',').map(Number)
    return {
      type: 'Feature', properties: { o: `${la}°N ${lo}°E`, so_nguoi: c.n, thu_nhap_tb: +(c.tn / c.n).toFixed(1) },
      geometry: { type: 'Polygon', coordinates: [[[lo, la], [lo + 1, la], [lo + 1, la + 1], [lo, la + 1], [lo, la]]] },
    }
  })

  return [
    { name: 'tinh.csv', kind: 'csv', content: ['ten,vung,lat,lon,dan_so,ty_le_do_thi,thu_nhap', ...tinh.map((t) => [t.ten, t.vung, t.lat, t.lon, t.dan_so, t.ty_le_do_thi, t.thu_nhap].join(','))].join('\n') },
    { name: 'thang.csv', kind: 'csv', content: thang.join('\n') },
    { name: 'khao_sat.csv', kind: 'csv', content: ks.join('\n') },
    { name: 'o_luoi.geojson', kind: 'json', content: JSON.stringify({ type: 'FeatureCollection', features }) },
  ]
}

let n = 0
const specFig = (caption: string, s: Partial<ChartSpec> & Pick<ChartSpec, 'data' | 'type'>): FigureNode => {
  const spec = { ...defaultSpec(s.data), ...s }
  return { type: 'figure', id: `g${++n}`, caption, js: codegen(spec), python: '', params: specParams(spec), spec, display: 'output', codeAccess: 'both', children: [{ text: '' }] }
}
const codeFig = (caption: string, js: string, params: FigureNode['params'] = [], python = ''): FigureNode =>
  ({ type: 'figure', id: `g${++n}`, caption, js, python, params, display: 'output', codeAccess: 'both', children: [{ text: '' }] })
const tplFig = (id: string): FigureNode => ({ ...figureFromTemplate(FIGURE_TEMPLATES.find((t) => t.id === id)!), id: `g${++n}` })

const p = (text: string) => ({ type: 'p', children: [{ text }] })
const h = (level: 2 | 3, text: string) => ({ type: 'h' + level, children: [{ text }] })
const cols = (...columns: FigureNode[]) => ({ type: 'column_group', children: columns.map((f) => ({ type: 'column', width: `${100 / columns.length}%`, children: [f] })) })

const STACK_JS = `// Cột chồng 100%: cơ cấu phương tiện theo nhóm tuổi (tự viết bằng Observable Plot)
const ds = data.khao_sat
expose(ds.length)
return Plot.plot({
  width, height: 300, marginLeft: 50,
  x: { label: "Nhóm tuổi", domain: ["18–24", "25–34", "35–44", "45–54", "55+"] },
  y: { label: "Tỉ lệ", percent: true },
  color: { legend: true, scheme: "tableau10" },
  marks: [
    Plot.barY(ds, Plot.groupX({ y: "proportion-facet" }, { x: "nhom_tuoi", fill: "phuong_tien", offset: "normalize", tip: true })),
    Plot.ruleY([0]),
  ],
})`

const DOT_JS = `// Biểu đồ chấm (dot plot) có thanh trượt: tỉnh có thu nhập trên ngưỡng được tô đậm
const ds = data.tinh.slice().sort((a, b) => b.thu_nhap - a.thu_nhap)
expose(ds.filter(d => d.thu_nhap >= nguong).length)
return Plot.plot({
  width, height: 560, marginLeft: 130,
  x: { label: "Thu nhập (triệu đồng/tháng)", grid: true },
  y: { label: null, domain: ds.map(d => d.ten) },
  marks: [
    Plot.ruleX([nguong], { stroke: "#e45d2f", strokeDasharray: "4,3" }),
    Plot.ruleY(ds, { y: "ten", x1: 0, x2: "thu_nhap", stroke: "#e5e7eb" }),
    Plot.dot(ds, { y: "ten", x: "thu_nhap", r: 5, fill: d => d.thu_nhap >= nguong ? "#2a78d6" : "#cbd5e1", tip: true }),
  ],
})`

const DOT_PY = `tinh = data["tinh"]
ket_qua = int((tinh.thu_nhap >= nguong).sum())`

const RIDGE_JS = `// Đường mật độ (KDE) thời gian đi lại theo phương tiện, độ mượt chỉnh bằng thanh trượt
const ds = data.khao_sat
expose(ds.length)
return Plot.plot({
  width, height: 300,
  x: { label: "Thời gian đi lại (phút)" },
  y: { label: "Mật độ", grid: true },
  color: { legend: true, scheme: "tableau10" },
  marks: [
    Plot.areaY(ds, Plot.normalizeY("sum", Plot.binX({ y: "count" }, { x: "thoi_gian_phut", fill: "phuong_tien", thresholds: so_khoang, fillOpacity: 0.15, curve: "basis" }))),
    Plot.lineY(ds, Plot.normalizeY("sum", Plot.binX({ y: "count" }, { x: "thoi_gian_phut", stroke: "phuong_tien", thresholds: so_khoang, curve: "basis" }))),
  ],
})`

const CORR_JS = `// Ma trận tương quan giữa các biến số của khảo sát (tính bằng d3)
const cot = ["tuoi", "thu_nhap", "so_chuyen_tuan", "thoi_gian_phut", "diem_hai_long"]
const ds = data.khao_sat
const r = (a, b) => {
  const ma = d3.mean(ds, d => d[a]), mb = d3.mean(ds, d => d[b])
  const s = d3.sum(ds, d => (d[a] - ma) * (d[b] - mb))
  return s / Math.sqrt(d3.sum(ds, d => (d[a] - ma) ** 2) * d3.sum(ds, d => (d[b] - mb) ** 2))
}
const m = cot.flatMap(a => cot.map(b => ({ a, b, r: +r(a, b).toFixed(2) })))
expose(m)
return Plot.plot({
  width, height: 320, marginLeft: 110, marginBottom: 60,
  x: { label: null, tickRotate: -25, domain: cot }, y: { label: null, domain: cot },
  color: { scheme: "rdbu", domain: [-1, 1], legend: true, label: "Hệ số tương quan" },
  marks: [
    Plot.cell(m, { x: "a", y: "b", fill: "r", tip: true }),
    Plot.text(m, { x: "a", y: "b", text: d => d.r.toLocaleString("vi-VN"), fill: d => Math.abs(d.r) > 0.5 ? "white" : "black" }),
  ],
})`

const CORR_PY = `cot = ["tuoi", "thu_nhap", "so_chuyen_tuan", "thoi_gian_phut", "diem_hai_long"]
c = data["khao_sat"][cot].corr().round(2)
ket_qua = [{"a": a, "b": b, "r": float(c.loc[b, a])} for a in cot for b in cot]`

const WAFFLE_JS = `// Biểu đồ ô vuông (waffle): mỗi ô ≈ 1% người được khảo sát
const dem = d3.rollups(data.khao_sat, v => v.length, d => d.phuong_tien).sort((a, b) => b[1] - a[1])
const tong = d3.sum(dem, d => d[1])
let o = []
dem.forEach(([pt, n]) => { for (let i = 0; i < Math.round(100 * n / tong); i++) o.push({ pt }) })
o = o.slice(0, 100).map((d, i) => ({ ...d, cot: i % 10, hang: Math.floor(i / 10) }))
expose(dem)
return Plot.plot({
  width: Math.min(width, 420), height: 330, padding: 0.12,
  x: { axis: null }, y: { axis: null, reverse: true },
  color: { legend: true, scheme: "tableau10" },
  marks: [Plot.cell(o, { x: "cot", y: "hang", fill: "pt", rx: 3, tip: true })],
})`

const TREND_JS = `// Đường xu hướng: trung bình trượt và dải min–max trong cửa sổ (Đông Nam Bộ)
const goc = data.thang.filter(d => d.vung === "Đông Nam Bộ")
const cua = (i, f) => f(goc.slice(Math.max(0, i - cua_so + 1), i + 1), d => d.chi_tieu)
const ds = goc.map((d, i) => ({ ...d, thap: cua(i, d3.min), cao: cua(i, d3.max), tb: cua(i, d3.mean) }))
expose(ds.map(d => +d.tb.toFixed(2)))
return Plot.plot({
  width, height: 280,
  x: { label: "Tháng" }, y: { label: "Chi tiêu (tỉ đồng)", grid: true },
  marks: [
    Plot.areaY(ds, { x: "thang", y1: "thap", y2: "cao", fill: "#dbeafe" }),
    Plot.line(ds, { x: "thang", y: "chi_tieu", stroke: "#94a3b8" }),
    Plot.line(ds, { x: "thang", y: "tb", stroke: "#2a78d6", strokeWidth: 2.5 }),
    Plot.dot(ds, { x: "thang", y: "chi_tieu", r: 2, fill: "#94a3b8", tip: true }),
  ],
})`

const HTML_JS = `// Thẻ số liệu bằng HTML (không phải biểu đồ): tóm tắt nhanh dữ liệu khảo sát
const ds = data.khao_sat
const the = [
  ["Người trả lời", ds.length.toLocaleString("vi-VN"), ""],
  ["Thu nhập trung vị", d3.median(ds, d => d.thu_nhap).toLocaleString("vi-VN", { maximumFractionDigits: 1 }), "triệu/tháng"],
  ["Thời gian đi lại TB", Math.round(d3.mean(ds, d => d.thoi_gian_phut)), "phút"],
  ["Hài lòng TB", d3.mean(ds, d => d.diem_hai_long).toLocaleString("vi-VN", { maximumFractionDigits: 1 }), "/ 10"],
]
expose(the.map(t => t[1]))
return \`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;padding:4px">\${the.map(([t, v, dv]) =>
  \`<div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px"><div style="font-size:12px;color:#6b7280">\${pc.esc(t)}</div>
   <div style="font-size:24px;font-weight:600;margin-top:4px">\${v} <span style="font-size:12px;font-weight:400;color:#6b7280">\${dv}</span></div></div>\`).join("")}</div>\``

export function makeGallery(): PapercellDoc {
  n = 0
  return {
    version: 3,
    meta: { title: 'Bộ thử biểu đồ', authors: 'Dữ liệu giả lập · Papercell', date: '2026-10-18' },
    data: makeData(),
    content: [
      p('Bài này gom mọi loại hình Papercell đang hỗ trợ để thử nhanh. Dữ liệu (bấm nút "Dữ liệu" ở trên) đều là giả lập: 30 tỉnh/thành, chuỗi chi tiêu theo tháng của 7 vùng, khảo sát 1.500 người và một lưới ô GeoJSON.'),
      p('Mỗi hình ở phần 1 và 2 tạo bằng tab Thiết kế (chọn cột, không cần code): mở hình (✎) để đổi cột, loại hình, cách gộp. Phần 4 là hình viết code tay.'),
      h(2, '1. Biểu đồ cơ bản (tab Thiết kế)'),
      cols(
        specFig('Cột: tổng dân số theo vùng.', { data: 'tinh', type: 'bar', x: 'vung', y: 'dan_so', agg: 'sum', sort: 'desc', yLabel: 'Dân số (nghìn người)' }),
        specFig('Thanh ngang: thu nhập trung bình theo vùng.', { data: 'tinh', type: 'barh', y: 'vung', x: 'thu_nhap', agg: 'mean', sort: 'desc', xLabel: 'Thu nhập (triệu/tháng)' }),
      ),
      cols(
        specFig('Đường: chi tiêu theo tháng, mỗi vùng một đường.', { data: 'thang', type: 'line', x: 'thang', y: 'chi_tieu', color: 'vung', agg: 'sum' }),
        specFig('Vùng chồng: số giao dịch theo tháng.', { data: 'thang', type: 'area', x: 'thang', y: 'giao_dich', color: 'vung', agg: 'sum' }),
      ),
      cols(
        specFig('Phân tán: tỉ lệ đô thị và thu nhập, cỡ điểm theo dân số.', { data: 'tinh', type: 'scatter', x: 'ty_le_do_thi', y: 'thu_nhap', color: 'vung', size: 'dan_so' }),
        specFig('Histogram: phân bố thu nhập theo giới.', { data: 'khao_sat', type: 'histogram', x: 'thu_nhap', color: 'gioi', bins: 40 }),
      ),
      cols(
        specFig('Hộp: điểm hài lòng theo phương tiện.', { data: 'khao_sat', type: 'box', y: 'diem_hai_long', x: 'phuong_tien' }),
        specFig('Bản đồ nhiệt ô: số người theo nhóm tuổi × phương tiện.', { data: 'khao_sat', type: 'heatmap', x: 'nhom_tuoi', y: 'phuong_tien', agg: 'count', scheme: 'purples' }),
      ),
      specFig('Chia ô (facet): phương tiện theo từng vùng.', { data: 'khao_sat', type: 'bar', x: 'phuong_tien', facet: 'vung', agg: 'count' }),
      cols(
        specFig('Bảng: thu nhập trung bình theo vùng.', { data: 'khao_sat', type: 'table', x: 'vung', y: 'thu_nhap', agg: 'mean', sort: 'desc' }),
        specFig('Bảng: số người theo phương tiện.', { data: 'khao_sat', type: 'table', x: 'phuong_tien', agg: 'count', sort: 'desc' }),
      ),
      specFig('Bảng: các dòng đầu của dữ liệu tỉnh (cuộn ngang nếu hẹp).', { data: 'tinh', type: 'table' }),
      h(2, '2. Bản đồ (MapLibre, nền OpenFreeMap)'),
      specFig('Bản đồ điểm: tỉnh/thành, màu theo vùng, cỡ theo dân số.', { data: 'tinh', type: 'map-points', lat: 'lat', lon: 'lon', color: 'vung', size: 'dan_so', basemap: 'light' }),
      cols(
        specFig('Bản đồ nhiệt: nơi ở của người được khảo sát.', { data: 'khao_sat', type: 'map-heat', lat: 'lat', lon: 'lon', basemap: 'dark' }),
        specFig('Tô màu vùng (GeoJSON): số người khảo sát trong mỗi ô 1°.', { data: 'o_luoi', type: 'map-regions', color: 'so_nguoi', scheme: 'ylorrd', basemap: 'streets' }),
      ),
      h(2, '3. Mẫu có sẵn (nút Hình)'),
      p('Các mẫu dùng dữ liệu minh họa riêng, có thanh trượt. Mẫu "Mô hình Python" cần mở tab Tính sẵn và bấm Chạy để có hình.'),
      cols(tplFig('line'), tplFig('scatter')),
      cols(tplFig('histogram'), tplFig('hexbin')),
      tplFig('model'),
      h(2, '4. Hình viết code tay (Observable Plot, d3, HTML)'),
      codeFig('Thẻ số liệu HTML.', HTML_JS),
      cols(
        codeFig('Cột chồng 100%: cơ cấu phương tiện theo nhóm tuổi.', STACK_JS),
        codeFig('Ô vuông (waffle): mỗi ô ≈ 1% người trả lời.', WAFFLE_JS),
      ),
      codeFig('Biểu đồ chấm: thu nhập theo tỉnh, ngưỡng chỉnh bằng thanh trượt.', DOT_JS,
        [{ name: 'nguong', label: 'Ngưỡng thu nhập', min: 4, max: 12, step: 0.5, value: 8, unit: 'triệu' }], DOT_PY),
      cols(
        codeFig('Đường mật độ thời gian đi lại theo phương tiện.', RIDGE_JS, [{ name: 'so_khoang', label: 'Số khoảng', min: 10, max: 60, step: 5, value: 30 }]),
        codeFig('Ma trận tương quan (có Python gốc để kiểm chứng).', CORR_JS, [], CORR_PY),
      ),
      codeFig('Xu hướng có trung bình trượt (Đông Nam Bộ).', TREND_JS, [{ name: 'cua_so', label: 'Cửa sổ trượt', min: 1, max: 12, step: 1, value: 3, unit: 'tháng' }]),
      p('Thêm hình: bấm nút "Hình" trên thanh công cụ, gõ / ở dòng trống, hoặc bấm + cạnh tay cầm ⠿ bên trái mỗi khối.'),
    ],
  }
}
