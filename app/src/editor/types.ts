/** Cách thẻ hình hiện trong bài. */
export type FigureDisplay = 'output' | 'both' | 'code' | 'hidden'
/** Người đọc được xem code nào trong popup. */
export type CodeAccess = 'none' | 'js' | 'python' | 'both'

export type FigureParam = { name: string; label: string; min: number; max: number; step: number; value: number; unit?: string }

import type { ChartSpec } from '@/figure/builder'
import type { ScenarioCache } from '@/figure/scenarios'

export type VerifyResult = { ok: boolean; message: string; at: string }

export type FigureNode = {
  type: 'figure'
  id: string
  caption: string
  /** Code JS vẽ hình: có sẵn Plot, d3, data, width, expose() và mỗi tham số là một biến. */
  js: string
  /** Code Python gốc của nhà nghiên cứu, chỉ để đối chiếu và kiểm chứng. */
  python: string
  params: FigureParam[]
  display: FigureDisplay
  codeAccess: CodeAccess
  verify?: VerifyResult
  /** Có nếu hình tạo bằng trình tạo biểu đồ; code JS được sinh từ đây. */
  spec?: ChartSpec
  /** Người dùng đã sửa code tay nên Thiết kế không ghi đè code nữa. */
  specDetached?: boolean
  /** Caption label: numbered as a Figure or a Table (separate counters), or not numbered. Empty = automatic. */
  label?: CaptionKind
  /** Code trước khi bị thiết kế thay thế, để nút "Quay lại code cũ" dùng. */
  codeBackup?: { js: string; params: FigureParam[]; spec?: ChartSpec; specDetached?: boolean }
  /** Kết quả Python đã tính sẵn cho mọi tổ hợp tham số (để xuất bản không cần Python). */
  scenarios?: ScenarioCache
  /** Mở popup ở tab Thiết kế ngay khi vừa chèn. */
  autoOpen?: boolean
  children: [{ text: '' }]
}

export type EquationNode = { type: 'equation'; id: string; texExpression: string; children: [{ text: '' }] }

export type CaptionKind = 'figure' | 'table' | 'none'

export const CAPTION_LABEL: Record<CaptionKind, string> = { figure: 'Figure', table: 'Table', none: 'No number' }

export type DataFile = {
  name: string; kind: 'csv' | 'json'; content: string
  /** Display names for columns (column → label). Empty = use the column name from the file. */
  labels?: Record<string, string>
}

export type DocMeta = { title: string; authors: string; date: string }

export type PapercellDoc = {
  version: 3
  meta: DocMeta
  data: DataFile[]
  content: any[]
}

export const DISPLAY_LABEL: Record<FigureDisplay, string> = {
  output: 'Figure only',
  both: 'Figure + code below',
  code: 'Code only',
  hidden: 'Hidden when published',
}

export const ACCESS_LABEL: Record<CodeAccess, string> = {
  none: 'No code visible',
  js: 'JS code only',
  python: 'Original Python only',
  both: 'Python and JS',
}

export const newId = () => Math.random().toString(36).slice(2, 10)

export const STARTER_JS = `// Có sẵn: Plot, d3, data (các file dữ liệu), width, expose(giá_trị)
// Mỗi tham số là một biến cùng tên. Trả về một hình (Plot.plot) hoặc chuỗi HTML.
const ds = data[Object.keys(data)[0]] ?? []
return Plot.plot({
  width,
  marks: [Plot.text(["New figure: open it to write code"], { frameAnchor: "middle" })],
})`

export const newFigureNode = (): FigureNode => ({
  type: 'figure', id: newId(), caption: '', js: STARTER_JS, python: '', params: [],
  display: 'output', codeAccess: 'both', children: [{ text: '' }],
})

export const newEquationNode = (tex = 'E = mc^2'): EquationNode => ({ type: 'equation', id: newId(), texExpression: tex, children: [{ text: '' }] })
