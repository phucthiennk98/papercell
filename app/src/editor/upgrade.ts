// Upgrades a document when it is opened: applies chart-builder fixes and repairs figures overwritten by mistake.
import { makeGallery as makeLegacyGallery } from '@/legacy/gallery-vi'
import { codegen } from '@/figure/builder'
import { newId, type FigureNode, type PapercellDoc } from './types'
import { GALLERY_TITLE } from '@/gallery'
import { LEGACY_SAMPLE_TITLE, LEGACY_SAMPLE_TITLE_EN, SAMPLE_TITLE } from '@/sample'
import { CONTROLS_ID_PREFIX, PARAMS_DEMO_ID, controlsSection, paramsDemo } from '@/demo-params'

/** Title of the old Vietnamese chart gallery. */
const LEGACY_GALLERY_TITLE = 'Bộ thử biểu đồ'

/** Re-wraps two top-level figures in the sample article if an earlier AI edit unwrapped their 2-column group. */
function repairSampleColumnGroup(content: any[]): any[] {
  const out: any[] = []
  for (let i = 0; i < content.length; i++) {
    const cur = content[i]
    const next = content[i + 1]
    if (cur?.type === 'figure' && next?.type === 'figure') {
      out.push({
        type: 'column_group',
        children: [
          { type: 'column', width: '55%', children: [cur] },
          { type: 'column', width: '45%', children: [next] },
        ],
      })
      i++
      continue
    }
    out.push(cur)
  }
  return out
}

function mapFigures(nodes: any[], fn: (f: FigureNode) => FigureNode): any[] {
  return nodes.map((n) => (n.type === 'figure' ? fn(n as FigureNode) : n.children ? { ...n, children: mapFigures(n.children, fn) } : n))
}

/** Figures keyed by caption (each gallery figure has its own caption; ids may differ between gallery versions). */
function collect(nodes: any[], out = new Map<string, FigureNode>()) {
  nodes.forEach((n) => { if (n.type === 'figure') out.set(n.caption, n); else if (n.children) collect(n.children, out) })
  return out
}

/** Galleries made before the parameter controls existed: insert the dropdown/radio/switch example after the dot plot. */
function addParamsDemo(content: any[], lang: 'en' | 'vi'): any[] {
  let has = false
  const scan = (ns: any[]) => ns.forEach((n) => { if (n.type === 'figure' && (n.id === PARAMS_DEMO_ID || /^Dropdown/.test(n.caption ?? ''))) has = true; else if (n.children) scan(n.children) })
  scan(content)
  if (has) return content
  const at = content.findIndex((n) => n.type === 'figure' && /^(Dot plot|Biểu đồ chấm)/.test(n.caption ?? ''))
  const i = at >= 0 ? at + 1 : Math.max(0, content.length - 1)
  return [...content.slice(0, i), paramsDemo(lang), ...content.slice(i)]
}

/** Galleries made before the reader-controls templates: add their section before the closing paragraph. */
function addControlsSection(content: any[]): any[] {
  let has = false
  const scan = (ns: any[]) => ns.forEach((n) => { if (n.type === 'figure' && String(n.id).startsWith(CONTROLS_ID_PREFIX)) has = true; else if (n.children) scan(n.children) })
  scan(content)
  if (has) return content
  const last = content.length - 1
  const i = last >= 0 && content[last].type === 'p' ? last : content.length
  return [...content.slice(0, i), ...controlsSection(), ...content.slice(i)]
}

/** Ensure every element node in the document tree has a unique id so drag-and-drop and block selection work reliably. */
function ensureNodeIds(nodes: any[]): any[] {
  const seen = new Set<string>()
  const walk = (list: any[]): any[] =>
    list.map((n) => {
      if (!n || typeof n !== 'object' || 'text' in n) return n
      let id = typeof n.id === 'string' && n.id.trim() ? n.id.trim() : ''
      if (!id || seen.has(id)) id = newId()
      seen.add(id)
      let next = id === n.id ? n : { ...n, id }
      if (
        next.type === 'equation' &&
        next.id === 'eq1' &&
        (!next.description || String(next.description).startsWith('ΔT₀:'))
      ) {
        next = {
          ...next,
          description: [
            String.raw`• $\Delta T_0$: Baseline afternoon surface UHI amplitude ($^\circ\text{C}$) in treeless impervious blocks`,
            String.raw`• $\alpha$: Empirical canopy cooling efficiency coefficient`,
            String.raw`• $f_c \in [0, 1]$: Fractional tree canopy cover within the sensor footprint`,
            String.raw`• $d$: Lateral distance from the vegetated greenway corridor axis ($\text{km}$)`,
            String.raw`• $\lambda = 0.60\text{ km}$: Characteristic $e$-folding radiative–convective decay scale`,
            String.raw`• $\varepsilon \sim \mathcal{N}(0, \sigma^2)$: Zero-mean microclimate residual`,
          ].join('\n'),
          descriptionMode: next.descriptionMode || 'inline',
        }
      }
      return Array.isArray(next.children) ? { ...next, children: walk(next.children) } : next
    })
  return walk(nodes)
}

export function upgradeDoc(doc: PapercellDoc): PapercellDoc {
  if (doc.meta.title === SAMPLE_TITLE || doc.meta.title === LEGACY_SAMPLE_TITLE || doc.meta.title === LEGACY_SAMPLE_TITLE_EN) doc = { ...doc, content: repairSampleColumnGroup(doc.content) }
  if (doc.meta.title === GALLERY_TITLE || doc.meta.title === LEGACY_GALLERY_TITLE) doc = { ...doc, content: addControlsSection(doc.content) }
  if (doc.meta.title === GALLERY_TITLE) doc = { ...doc, content: addParamsDemo(doc.content, 'en') }
  if (doc.meta.title === LEGACY_GALLERY_TITLE) doc = { ...doc, content: addParamsDemo(doc.content, 'vi') }
  // Hand-written gallery figures once overwritten by the Design tab (bug since fixed): put the original back
  const original = doc.meta.title === LEGACY_GALLERY_TITLE ? collect(makeLegacyGallery().content) : null
  const upgraded = mapFigures(doc.content, (f) => {
    const o = original?.get(f.caption)
    if (o && !o.spec && f.spec && !f.codeBackup) f = { ...o, id: f.id }
    if (/\bket_qua\b/.test(f.js) || /\bket_qua\b/.test(f.python)) {
      f = {
        ...f,
        js: f.js.replace(/\bket_qua\b/g, 'result'),
        python: f.python.replace(/\bket_qua\b/g, 'result'),
      }
    }
    // Built with the Design tab and not edited by hand: regenerate so it picks up chart-builder fixes
    if (f.spec && !f.specDetached) {
      const js = codegen(f.spec)
      if (js !== f.js) return { ...f, js }
    }
    return f
  })
  return {
    ...doc,
    content: ensureNodeIds(upgraded),
  }
}
