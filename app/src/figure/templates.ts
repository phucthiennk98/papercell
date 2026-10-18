// Mẫu biểu đồ để chèn nhanh. Mỗi mẫu có dữ liệu minh họa nên vẽ được ngay;
// đổi `ds` thành data.<tên_file> để dùng dữ liệu của bài.
import { ChartColumn, ChartLine, ChartScatter, ChartNoAxesColumn, Hexagon, Table2, SquareCode, type LucideIcon } from 'lucide-react'
import { newId, type FigureNode, type FigureParam } from '@/editor/types'

export type FigureTemplate = { id: string; label: string; hint: string; icon: LucideIcon; keywords: string[]; js: string; params?: FigureParam[]; caption?: string }

const HEAD = (what: string) => `// ${what}
// Có sẵn: Plot, d3, data.<tên_file>, width, expose(giá_trị); mỗi tham số là một biến.
// Đang dùng dữ liệu minh họa: thay \`ds\` bằng data.<tên_file> để dùng dữ liệu của bài.`

export const FIGURE_TEMPLATES: FigureTemplate[] = [
  {
    id: 'bar', label: 'Biểu đồ cột', hint: 'So sánh giá trị giữa các nhóm', icon: ChartColumn, keywords: ['cot', 'bar', 'column'],
    js: `${HEAD('Biểu đồ cột')}
const ds = [
  { nhom: "Nhóm A", gia_tri: 28 }, { nhom: "Nhóm B", gia_tri: 55 },
  { nhom: "Nhóm C", gia_tri: 43 }, { nhom: "Nhóm D", gia_tri: 91 }, { nhom: "Nhóm E", gia_tri: 64 },
]
expose(ds)
return Plot.plot({
  width, height: 280, marginLeft: 48,
  x: { label: null },
  y: { grid: true, label: "Giá trị" },
  marks: [
    Plot.barY(ds, { x: "nhom", y: "gia_tri", fill: "#2a78d6", tip: true }),
    Plot.ruleY([0]),
  ],
})`,
  },
  {
    id: 'line', label: 'Biểu đồ đường', hint: 'Xu hướng theo thời gian', icon: ChartLine, keywords: ['duong', 'line', 'thoi gian', 'xu huong'],
    params: [{ name: 'cua_so', label: 'Làm mượt (số điểm)', min: 1, max: 15, step: 1, value: 1 }],
    js: `${HEAD('Biểu đồ đường, có làm mượt bằng trung bình trượt')}
const rnd = d3.randomNormal.source(d3.randomLcg(1))(0, 6)
const ds = d3.range(60).map((i) => ({ thang: i + 1, gia_tri: 50 + i * 0.8 + 12 * Math.sin(i / 5) + rnd() }))
expose(ds.length)
return Plot.plot({
  width, height: 280,
  x: { label: "Tháng" },
  y: { grid: true, label: "Giá trị" },
  marks: [
    Plot.line(ds, { x: "thang", y: "gia_tri", stroke: "#94a3b8", strokeWidth: 1 }),
    Plot.line(ds, Plot.windowY({ k: cua_so, x: "thang", y: "gia_tri", stroke: "#2a78d6", strokeWidth: 2 })),
  ],
})`,
  },
  {
    id: 'scatter', label: 'Biểu đồ phân tán', hint: 'Quan hệ giữa hai biến', icon: ChartScatter, keywords: ['phan tan', 'scatter', 'tuong quan'],
    params: [{ name: 'ban_kinh_diem', label: 'Cỡ điểm', min: 1, max: 8, step: 0.5, value: 3 }],
    js: `${HEAD('Biểu đồ phân tán, kèm đường hồi quy tuyến tính')}
const rnd = d3.randomNormal.source(d3.randomLcg(2))(0, 8)
const ds = d3.range(150).map(() => { const x = Math.random() * 100; return { x, y: 0.6 * x + 10 + rnd() } })
expose(ds.length)
return Plot.plot({
  width, height: 300,
  x: { label: "Biến X" },
  y: { grid: true, label: "Biến Y" },
  marks: [
    Plot.dot(ds, { x: "x", y: "y", r: ban_kinh_diem, fill: "#2a78d6", fillOpacity: 0.6 }),
    Plot.linearRegressionY(ds, { x: "x", y: "y", stroke: "#e45d2f" }),
  ],
})`,
  },
  {
    id: 'histogram', label: 'Histogram', hint: 'Phân bố của một biến', icon: ChartNoAxesColumn, keywords: ['histogram', 'phan bo', 'tan suat'],
    params: [{ name: 'so_cot', label: 'Số cột', min: 5, max: 60, step: 1, value: 20 }],
    js: `${HEAD('Histogram: phân bố của một biến số')}
const rnd = d3.randomExponential.source(d3.randomLcg(3))(1 / 0.6)
const ds = d3.range(2000).map(() => ({ khoang_cach: rnd() }))
expose(ds.length)
return Plot.plot({
  width, height: 280,
  x: { label: "Khoảng cách (km)" },
  y: { grid: true, label: "Số lượng" },
  marks: [
    Plot.rectY(ds, Plot.binX({ y: "count" }, { x: "khoang_cach", thresholds: so_cot, fill: "#2a78d6", tip: true })),
    Plot.ruleY([0]),
  ],
})`,
  },
  {
    id: 'hexbin', label: 'Bản đồ mật độ', hint: 'Mật độ điểm theo ô lục giác', icon: Hexagon, keywords: ['ban do', 'map', 'mat do', 'hexbin', 'luc giac'],
    params: [{ name: 'o_luoi', label: 'Kích thước ô', min: 6, max: 30, step: 1, value: 14, unit: 'px' }],
    js: `${HEAD('Bản đồ mật độ: gộp điểm theo ô lục giác')}
const rx = d3.randomNormal.source(d3.randomLcg(4))
const ds = [...d3.range(800).map(() => ({ x: rx(10, 3)(), y: rx(5, 2)() })), ...d3.range(500).map(() => ({ x: rx(20, 2)(), y: rx(9, 1.5)() }))]
expose(ds.length)
return Plot.plot({
  width, aspectRatio: 1,
  x: { label: "Đông (km)" }, y: { label: "Bắc (km)" },
  color: { scheme: "blues", legend: true, label: "Số điểm" },
  marks: [Plot.dot(ds, Plot.hexbin({ fill: "count" }, { x: "x", y: "y", binWidth: o_luoi }))],
})`,
  },
  {
    id: 'table', label: 'Bảng số liệu', hint: 'Bảng tóm tắt dạng HTML', icon: Table2, keywords: ['bang', 'table', 'so lieu'],
    js: `${HEAD('Bảng số liệu: trả về chuỗi HTML')}
const ds = [
  { chi_tieu: "Số quan sát", gia_tri: 5000 },
  { chi_tieu: "Trung bình (km)", gia_tri: 0.6 },
  { chi_tieu: "Trung vị (km)", gia_tri: 0.42 },
]
expose(ds)
return \`<table class="fig-table">
  <thead><tr><th>Chỉ tiêu</th><th>Giá trị</th></tr></thead>
  <tbody>\${ds.map((r) => \`<tr><td>\${r.chi_tieu}</td><td>\${r.gia_tri.toLocaleString("vi-VN")}</td></tr>\`).join("")}</tbody>
</table>\``,
  },
  {
    id: 'blank', label: 'Hình trống', hint: 'Tự viết code, hoặc nhờ AI', icon: SquareCode, keywords: ['trong', 'code', 'tu viet', 'js'],
    js: `${HEAD('Hình trống')}
return Plot.plot({ width, height: 160, marks: [Plot.text(["Mở hình (✎) để viết code"], { frameAnchor: "middle", fontSize: 14 })] })`,
  },
]

export const figureFromTemplate = (t: FigureTemplate): FigureNode => ({
  type: 'figure', id: newId(), caption: t.id === 'blank' ? '' : t.label, js: t.js, python: '',
  params: (t.params ?? []).map((p) => ({ ...p })), display: 'output', codeAccess: 'both', children: [{ text: '' }],
})

/** Chèn một hình theo mẫu ngay sau khối đang chọn (hoặc thay đoạn văn trống). */
export function insertFigure(editor: any, templateId: string) {
  const t = FIGURE_TEMPLATES.find((x) => x.id === templateId) ?? FIGURE_TEMPLATES[FIGURE_TEMPLATES.length - 1]
  const node = figureFromTemplate(t)
  const block = editor.api.block()
  const emptyPara = block && block[0].type === 'p' && editor.api.isEmpty(block[0])
  if (emptyPara) editor.tf.replaceNodes(node, { at: block[1] })
  else editor.tf.insertNodes(node, { select: true })
}
