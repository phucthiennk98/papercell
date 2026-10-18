import type { CellOutput } from '../python/kernel'

export type CellDisplay = 'both' | 'output' | 'code' | 'hidden'

export type PythonNode = {
  type: 'python'
  id: string
  code: string
  display: CellDisplay
  caption?: string
  outputs?: CellOutput[]
  stdout?: string
  stderr?: string
  error?: string | null
  execCount?: number
  children: [{ text: '' }]
}

export type ParamNode = {
  type: 'param'
  id: string
  name: string
  label: string
  min: number
  max: number
  step: number
  value: number
  unit?: string
  children: [{ text: '' }]
}

export type EquationNode = { type: 'equation'; id: string; texExpression: string; children: [{ text: '' }] }

export type DocMeta = { title: string; authors: string; date: string }

export type PapercellDoc = {
  version: 1
  meta: DocMeta
  content: any[]
}

export const DISPLAY_LABEL: Record<CellDisplay, string> = {
  both: 'Code + kết quả',
  output: 'Chỉ kết quả',
  code: 'Chỉ code',
  hidden: 'Ẩn khi xuất bản',
}

export const newId = () => Math.random().toString(36).slice(2, 10)

export const newPythonNode = (code = ''): PythonNode => ({
  type: 'python', id: newId(), code, display: 'both', caption: '', children: [{ text: '' }],
})

export const newParamNode = (name: string): ParamNode => ({
  type: 'param', id: newId(), name, label: 'Tham số mới', min: 0, max: 10, step: 1, value: 5, unit: '', children: [{ text: '' }],
})

export const newEquationNode = (tex = 'E = mc^2'): EquationNode => ({ type: 'equation', id: newId(), texExpression: tex, children: [{ text: '' }] })
