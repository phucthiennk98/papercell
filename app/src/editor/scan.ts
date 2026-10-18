import type { FigureNode } from './types'

export type Heading = { id: string; level: number; text: string }

/** Đánh số hình (có chú thích, không ẩn) và lấy dàn ý từ các tiêu đề. */
export function scan(content: any[]) {
  const figs = new Map<string, number>(); const headings: Heading[] = []
  const text = (n: any): string => (typeof n.text === 'string' ? n.text : (n.children ?? []).map(text).join(''))
  const walk = (nodes: any[]) => nodes.forEach((n) => {
    if (n.type === 'figure') { const f = n as FigureNode; if (f.caption?.trim() && f.display !== 'hidden') figs.set(f.id, figs.size + 1) }
    else if (/^h[1-3]$/.test(n.type) && n.id) headings.push({ id: n.id, level: +n.type[1], text: text(n) })
    if (n.children && n.type !== 'figure') walk(n.children)
  })
  walk(content)
  return { figs, headings }
}
