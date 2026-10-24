import type { CaptionKind, FigureNode } from './types'

export type Heading = { id: string; level: number; text: string }

/** Number visible captioned figures and extract the document outline from heading blocks. */
/** Automatic caption label: tables built by the chart builder or returning an HTML table are Tables, the rest Figures. */
export function captionKind(f: FigureNode): CaptionKind {
  if (f.label) return f.label
  if (f.spec?.type === 'table') return 'table'
  if (!f.spec && /<table class="fig-table/.test(f.js)) return 'table'
  return 'figure'
}

/** Clicking a caption label always changes what is shown: Figure → Table → no number → Figure (Automatic is in Settings). */
export const NEXT_CAPTION: Record<CaptionKind, CaptionKind> = { figure: 'table', table: 'none', none: 'figure' }

/** Number figures and tables separately ("Figure 3", "Table 1") and collect the outline from headings. */
export function scan(content: any[]) {
  const figs = new Map<string, string>(); const headings: Heading[] = []
  const count = { figure: 0, table: 0 }
  const text = (n: any): string => (typeof n.text === 'string' ? n.text : (n.children ?? []).map(text).join(''))
  const walk = (nodes: any[]) => nodes.forEach((n) => {
    if (n.type === 'figure') { const f = n as FigureNode; const k = captionKind(f); if (f.caption?.trim() && f.display !== 'hidden' && k !== 'none') figs.set(f.id, `${k === 'table' ? 'Table' : 'Figure'} ${++count[k]}`) }
    else if (/^h[1-3]$/.test(n.type) && n.id) headings.push({ id: n.id, level: +n.type[1], text: text(n) })
    if (n.children && n.type !== 'figure') walk(n.children)
  })
  walk(content)
  return { figs, headings }
}
