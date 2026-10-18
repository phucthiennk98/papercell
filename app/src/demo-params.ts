// Example figure with every reader control: a dropdown (variable), radio buttons (how many) and a switch (order).
// Added to new chart galleries and inserted into existing ones when they are opened.
import type { FigureNode } from './editor/types'
import { FIGURE_TEMPLATES, figureFromTemplate } from './figure/templates'

export const PARAMS_DEMO_ID = 'demo-params'

type Variant = { data: string; name: string; metrics: string[]; caption: string }
const VARIANTS: Record<'en' | 'vi', Variant> = {
  en: { data: 'provinces', name: 'name', metrics: ['income', 'population', 'urban_share'], caption: 'Dropdown, radio buttons and switch: readers choose the variable, how many provinces and the order.' },
  vi: { data: 'tinh', name: 'ten', metrics: ['thu_nhap', 'dan_so', 'ty_le_do_thi'], caption: 'Dropdown, nút tròn và công tắc: người đọc chọn biến, số tỉnh hiển thị và cách sắp xếp.' },
}

export function paramsDemo(lang: 'en' | 'vi'): FigureNode {
  const v = VARIANTS[lang]
  const js = `// Readers pick the variable (dropdown), how many provinces (radio buttons) and the order (switch)
let rows = data.${v.data}.slice()
if (sort_desc) rows.sort((a, b) => b[metric] - a[metric])
rows = rows.slice(0, top_n)
expose(rows.map(d => d[metric]))
return Plot.plot({
  width, height: 60 + 22 * rows.length, marginLeft: 130,
  x: { label: pc.label("${v.data}", metric), grid: true },
  y: { label: null, domain: rows.map(d => d.${v.name}) },
  marks: [
    Plot.barX(rows, { y: "${v.name}", x: metric, fill: "#2a78d6", tip: true }),
    Plot.ruleX([0]),
  ],
})`
  const python = `rows = data["${v.data}"]
if sort_desc:
    rows = rows.sort_values(metric, ascending=False)
ket_qua = rows[metric].head(top_n).tolist()`
  return {
    type: 'figure', id: PARAMS_DEMO_ID, caption: v.caption, js, python, display: 'output', codeAccess: 'both', children: [{ text: '' }],
    params: [
      { name: 'metric', label: lang === 'en' ? 'Variable' : 'Biến', kind: 'select', options: v.metrics, value: v.metrics[0], min: 0, max: 0, step: 1 },
      { name: 'top_n', label: lang === 'en' ? 'Show' : 'Hiển thị', kind: 'radio', options: [10, 20, 30], value: 10, min: 0, max: 0, step: 1 },
      { name: 'sort_desc', label: lang === 'en' ? 'Sort by value' : 'Sắp xếp theo giá trị', kind: 'toggle', value: true, min: 0, max: 1, step: 1 },
    ],
  }
}

export const CONTROLS_ID_PREFIX = 'demo-ctl-'

/** Gallery section with every reader-controls template, side by side in pairs. */
export function controlsSection(): any[] {
  const fig = (id: string) => ({ ...figureFromTemplate(FIGURE_TEMPLATES.find((t) => t.id === id)!), id: CONTROLS_ID_PREFIX + id })
  const cols = (...f: FigureNode[]) => ({ type: 'column_group', children: f.map((x) => ({ type: 'column', width: `${100 / f.length}%`, children: [x] })) })
  return [
    { type: 'h2', children: [{ text: '5. Reader controls (dropdown, radio buttons, switch)' }] },
    { type: 'p', children: [{ text: 'Templates from the Figure menu → "With reader controls". The controls under each figure are variables in its code; set them up in the Parameters tab (Control: Slider, Dropdown, Radio buttons or On/off).' }] },
    cols(fig('controls-bar'), fig('controls-line')),
    cols(fig('controls-scatter'), fig('controls-hist')),
    fig('controls-map'),
  ]
}
