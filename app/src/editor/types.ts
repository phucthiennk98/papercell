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
