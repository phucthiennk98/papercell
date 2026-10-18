import { createPlatePlugin, PlateElement, PlateLeaf, type PlateElementProps, type PlateLeafProps, useReadOnly } from 'platejs/react'
import {
  BlockquotePlugin, BoldPlugin, CodePlugin, H1Plugin, H2Plugin, H3Plugin, HorizontalRulePlugin,
  ItalicPlugin, StrikethroughPlugin, SubscriptPlugin, SuperscriptPlugin, UnderlinePlugin,
} from '@platejs/basic-nodes/react'
import { TextAlignPlugin } from '@platejs/basic-styles/react'
import { IndentPlugin } from '@platejs/indent/react'
import { ColumnItemPlugin, ColumnPlugin } from '@platejs/layout/react'
import { DndPlugin } from '@platejs/dnd'
import { EquationPlugin } from '@platejs/math/react'
import { TrailingBlockPlugin, type TElement } from 'platejs'
import { BlockDraggable } from './BlockDraggable'
import { EquationElement } from './EquationBlock'
import { ParamElement } from './ParamBlock'
import { PythonCellElement } from './PythonCell'

const TEXT_BLOCKS = ['p', 'h1', 'h2', 'h3', 'blockquote']

const el = (as: string) => (props: PlateElementProps) => <PlateElement as={as as any} {...props} />
const leaf = (as: string) => (props: PlateLeafProps) => <PlateLeaf as={as as any} {...props} />

function ColumnGroupElement(props: PlateElementProps) {
  return <PlateElement {...props} className="pc-columns">{props.children}</PlateElement>
}

const pct = (v: number) => Math.round(v * 10) / 10 + '%'

function ColumnElement(props: PlateElementProps) {
  const { editor, element } = props
  const readOnly = useReadOnly()
  const width = (element as any).width ?? '50%'
  const path = editor.api.findPath(element)
  const group = path ? (editor.api.node(path.slice(0, -1))?.[0] as TElement | undefined) : undefined
  const isLast = !path || !group || path[path.length - 1] >= group.children.length - 1

  // Kéo mép phải để chia lại độ rộng giữa cột này và cột kế bên.
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const at = editor.api.findPath(element); if (!at || !group) return
    const i = at[at.length - 1], nextAt = [...at.slice(0, -1), i + 1]
    const next = group.children[i + 1] as any; if (!next) return
    const total = (e.currentTarget.closest('.pc-columns') as HTMLElement).getBoundingClientRect().width
    const a0 = parseFloat(width), b0 = parseFloat(next.width ?? '50%'), x0 = e.clientX
    document.body.classList.add('is-resizing')
    const move = (ev: PointerEvent) => {
      const a = Math.max(15, Math.min(a0 + b0 - 15, a0 + ((ev.clientX - x0) / total) * 100))
      editor.tf.withoutNormalizing(() => {
        editor.tf.setNodes({ width: pct(a) } as any, { at })
        editor.tf.setNodes({ width: pct(a0 + b0 - a) } as any, { at: nextAt })
      })
    }
    const up = () => { removeEventListener('pointermove', move); document.body.classList.remove('is-resizing') }
    addEventListener('pointermove', move)
    addEventListener('pointerup', up, { once: true })
  }

  return (
    <PlateElement {...props} className={'pc-column' + (readOnly ? '' : ' is-edit')} style={{ flexBasis: width, width }}>
      {props.children}
      {!readOnly && !isLast && (
        <div className="pc-col-resize" contentEditable={false} onPointerDown={startResize} role="separator" aria-orientation="vertical" aria-label="Kéo để đổi độ rộng cột" data-tip={width} />
      )}
    </PlateElement>
  )
}

function HrElement(props: PlateElementProps) {
  return <PlateElement {...props}><div contentEditable={false}><hr className="pc-hr" /></div>{props.children}</PlateElement>
}

export const PythonPlugin = createPlatePlugin({
  key: 'python',
  node: { isElement: true, isVoid: true, component: PythonCellElement },
})

export const ParamPlugin = createPlatePlugin({
  key: 'param',
  node: { isElement: true, isVoid: true, component: ParamElement },
})

export const plugins = [
  H1Plugin.withComponent(el('h1')),
  H2Plugin.withComponent(el('h2')),
  H3Plugin.withComponent(el('h3')),
  BlockquotePlugin.withComponent(el('blockquote')),
  HorizontalRulePlugin.withComponent(HrElement),
  BoldPlugin.withComponent(leaf('strong')),
  ItalicPlugin.withComponent(leaf('em')),
  UnderlinePlugin.withComponent(leaf('u')),
  StrikethroughPlugin.withComponent(leaf('s')),
  CodePlugin.withComponent(leaf('code')),
  SubscriptPlugin.withComponent(leaf('sub')),
  SuperscriptPlugin.withComponent(leaf('sup')),
  TextAlignPlugin.configure({ inject: { targetPlugins: TEXT_BLOCKS } }),
  IndentPlugin.configure({ inject: { targetPlugins: TEXT_BLOCKS } }),
  ColumnPlugin.withComponent(ColumnGroupElement),
  ColumnItemPlugin.withComponent(ColumnElement),
  PythonPlugin,
  ParamPlugin,
  EquationPlugin.withComponent(EquationElement),
  TrailingBlockPlugin,
  DndPlugin.configure({ options: { enableScroller: true }, render: { aboveNodes: BlockDraggable } }),
]
