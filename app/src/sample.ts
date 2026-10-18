import type { DataFile, FigureNode, PapercellDoc } from './editor/types'

// ---- Dữ liệu giả lập: 5.000 chuyến đi quanh 14 ga (cố định nhờ hạt giống ngẫu nhiên) ----
function mulberry32(a: number) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
function makeData(): DataFile[] {
  const rnd = mulberry32(7)
  const normal = (m: number, s: number) => m + s * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())
  const ga = Array.from({ length: 14 }, (_, i) => { const x = (18 * i) / 13; return { ga: `G${String(i + 1).padStart(2, '0')}`, x: +x.toFixed(3), y: +(3 * Math.sin(x / 4.5) + 0.2 * x).toFixed(3) } })
  const rows: string[] = ['x,y,gio,khoang_cach_km,ga']
  for (let i = 0; i < 5000; i++) {
    const g = ga[Math.floor(rnd() * ga.length)]
    const kc = -0.6 * Math.log(1 - rnd()), goc = 2 * Math.PI * rnd()
    const gio = Math.min(23, Math.max(5, Math.round(i < 2500 ? normal(7.5, 1) : normal(17.8, 1.2))))
    rows.push([(g.x + kc * Math.cos(goc)).toFixed(3), (g.y + kc * Math.sin(goc)).toFixed(3), gio, kc.toFixed(2), g.ga].join(','))
  }
  return [
    { name: 'trips.csv', kind: 'csv', content: rows.join('\n') },
    { name: 'ga.csv', kind: 'csv', content: ['ga,x,y', ...ga.map((g) => `${g.ga},${g.x},${g.y}`)].join('\n') },
  ]
}

const BAN_KINH = { name: 'ban_kinh_km', label: 'Bán kính quanh ga', min: 0.2, max: 3, step: 0.1, value: 1.5, unit: 'km' }

const fig = (id: string, caption: string, js: string, python: string, params: FigureNode['params'], extra: Partial<FigureNode> = {}) =>
  ({ type: 'figure', id, caption, js, python, params, display: 'output', codeAccess: 'both', children: [{ text: '' }], ...extra })

const MAP_JS = `const gan = data.trips.filter(d => d.khoang_cach_km <= ban_kinh_km)
expose(gan.length)
return Plot.plot({
  width,
  aspectRatio: 1,
  x: { label: "Đông (km)" },
  y: { label: "Bắc (km)" },
  color: { scheme: "blues", legend: true, label: "Số chuyến" },
  marks: [
    Plot.dot(gan, Plot.hexbin({ fill: "count" }, { x: "x", y: "y", binWidth: o_luoi })),
    Plot.line(data.ga, { x: "x", y: "y", stroke: "#1f2937" }),
    Plot.dot(data.ga, { x: "x", y: "y", r: 3, fill: "#1f2937" }),
    Plot.text([\`\${gan.length.toLocaleString("vi-VN")} chuyến trong \${ban_kinh_km.toLocaleString("vi-VN")} km\`],
      { frameAnchor: "top-left", dx: 4, dy: 4, fontSize: 11 }),
  ],
})`

const MAP_PY = `import matplotlib.pyplot as plt

trips, ga = data["trips"], data["ga"]
gan = trips[trips.khoang_cach_km <= ban_kinh_km]

fig, ax = plt.subplots(figsize=(5, 3.4))
ax.hexbin(gan.x, gan.y, gridsize=24, cmap="Blues", mincnt=1)
ax.plot(ga.x, ga.y, "o-", color="#1f2937")
ax.set_xlabel("Đông (km)")
ax.set_ylabel("Bắc (km)")

ket_qua = len(gan)`

const HOURS_JS = `const gan = data.trips.filter(d => d.khoang_cach_km <= ban_kinh_km)
const dem = d3.rollup(gan, v => v.length, d => d.gio)
expose(dem)
return Plot.plot({
  width,
  height: 260,
  x: { label: "Giờ trong ngày" },
  y: { label: "Số chuyến", grid: true },
  marks: [
    Plot.barY(gan, Plot.groupX({ y: "count" }, { x: "gio", fill: "#2a78d6", tip: true })),
    Plot.ruleY([0]),
  ],
})`

const HOURS_PY = `trips = data["trips"]
gan = trips[trips.khoang_cach_km <= ban_kinh_km]
dem = gan.groupby("gio").size()

ax = dem.plot.bar(color="#2a78d6")
ax.set_xlabel("Giờ trong ngày")
ax.set_ylabel("Số chuyến")

ket_qua = dem`

const TABLE_JS = `const nhom = [[0, 0.5, "dưới 0,5 km"], [0.5, 1, "0,5–1 km"], [1, 2, "1–2 km"], [2, Infinity, "trên 2 km"]]
const tong = data.trips.length
const bang = nhom.map(([a, b, vung]) => {
  const n = data.trips.filter(d => d.khoang_cach_km > a && d.khoang_cach_km <= b).length
  return { vung, so_chuyen: n, ty_le: Math.round(1000 * n / tong) / 10 }
})
expose(bang)
return \`<table class="fig-table">
  <thead><tr><th>Khoảng cách tới ga</th><th>Số chuyến</th><th>Tỉ lệ</th></tr></thead>
  <tbody>\${bang.map(r => \`<tr><td>\${r.vung}</td><td>\${r.so_chuyen.toLocaleString("vi-VN")}</td><td>\${r.ty_le.toLocaleString("vi-VN")}%</td></tr>\`).join("")}</tbody>
</table>\``

const TABLE_PY = `import pandas as pd

trips = data["trips"]
vung = pd.cut(trips.khoang_cach_km, [0, 0.5, 1, 2, float("inf")],
              labels=["dưới 0,5 km", "0,5–1 km", "1–2 km", "trên 2 km"])
bang = trips.groupby(vung, observed=False).size().reset_index()
bang.columns = ["vung", "so_chuyen"]
bang["ty_le"] = (100 * bang.so_chuyen / len(trips)).round(1)

ket_qua = bang`

const p = (text: string, extra: Record<string, unknown> = {}) => ({ type: 'p', ...extra, children: [{ text }] })
const h = (level: 1 | 2 | 3, text: string) => ({ type: 'h' + level, children: [{ text }] })
const cols = (widths: string[], ...columns: any[][]) => ({ type: 'column_group', children: columns.map((children, i) => ({ type: 'column', width: widths[i], children })) })

export function makeSample(): PapercellDoc {
  return {
    version: 3,
    meta: { title: 'Hành vi đi lại quanh một tuyến metro', authors: 'Tác giả mẫu · Papercell', date: '2026-10-18' },
    data: makeData(),
    content: [
      h(2, 'Tóm tắt'),
      p('Đây là bài mẫu của Papercell. Mỗi hình là một thẻ vẽ bằng JS, có thanh trượt ngay trong thẻ. Bấm vào hình để mở bản lớn. Dữ liệu là 5.000 chuyến đi giả lập quanh 14 ga, không phải số liệu thật.', { align: 'justify' }),
      h(2, '1. Dữ liệu và phương pháp'),
      p('Mỗi chuyến đi là một quyết định có tọa độ. Khoảng cách d từ điểm xuất phát tới ga theo phân phối mũ với trung bình μ = 0,6 km:', { align: 'justify' }),
      { type: 'equation', id: 'eq1', texExpression: String.raw`f(d) = \frac{1}{\mu}\, e^{-d/\mu}, \qquad d \ge 0`, children: [{ text: '' }] },
      cols(['40%', '60%'],
        [
          p('Hình 1 cho thấy mật độ chuyến đi tập trung dọc tuyến và thưa dần khi ra xa ga.', { align: 'justify' }),
          p('Mỗi hình có code Python gốc của tác giả và bản JS được chuyển đổi. Trong trình soạn, mở hình rồi chọn tab "Kiểm chứng" để so kết quả của hai bản trên cùng dữ liệu.', { align: 'justify' }),
        ],
        [fig('map', 'Mật độ chuyến đi theo ô lục giác quanh tuyến metro.', MAP_JS, MAP_PY,
          [BAN_KINH, { name: 'o_luoi', label: 'Kích thước ô', min: 8, max: 30, step: 1, value: 16, unit: 'px' }])],
      ),
      h(2, '2. Kết quả'),
      cols(['55%', '45%'],
        [fig('hours', 'Số chuyến theo giờ: hai đỉnh sáng và chiều.', HOURS_JS, HOURS_PY, [BAN_KINH])],
        [fig('table', 'Phân bố chuyến theo khoảng cách tới ga.', TABLE_JS, TABLE_PY, [], { codeAccess: 'python' })],
      ),
      p('Hơn một nửa số chuyến xuất phát trong bán kính 1 km quanh ga. Kéo thanh trượt trong mỗi hình để xem kết quả thay đổi.', { align: 'justify' }),
    ],
  }
}
