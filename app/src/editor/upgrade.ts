// Upgrades a document when it is opened: applies chart-builder fixes and repairs figures overwritten by mistake.
import { makeGallery as makeLegacyGallery } from '@/legacy/gallery-vi'
import { codegen } from '@/figure/builder'
import type { FigureNode, PapercellDoc } from './types'

/** Title of the old Vietnamese chart gallery. */
const LEGACY_GALLERY_TITLE = 'Bộ thử biểu đồ'

function mapFigures(nodes: any[], fn: (f: FigureNode) => FigureNode): any[] {
  return nodes.map((n) => (n.type === 'figure' ? fn(n as FigureNode) : n.children ? { ...n, children: mapFigures(n.children, fn) } : n))
}

/** Figures keyed by caption (each gallery figure has its own caption; ids may differ between gallery versions). */
function collect(nodes: any[], out = new Map<string, FigureNode>()) {
  nodes.forEach((n) => { if (n.type === 'figure') out.set(n.caption, n); else if (n.children) collect(n.children, out) })
  return out
}

export function upgradeDoc(doc: PapercellDoc): PapercellDoc {
  // Hand-written gallery figures once overwritten by the Design tab (bug since fixed): put the original back
  const original = doc.meta.title === LEGACY_GALLERY_TITLE ? collect(makeLegacyGallery().content) : null
  return {
    ...doc,
    content: mapFigures(doc.content, (f) => {
      const o = original?.get(f.caption)
      if (o && !o.spec && f.spec && !f.codeBackup) return { ...o, id: f.id }
      // Built with the Design tab and not edited by hand: regenerate so it picks up chart-builder fixes
      if (f.spec && !f.specDetached) {
        const js = codegen(f.spec)
        if (js !== f.js) return { ...f, js }
      }
      return f
    }),
  }
}
