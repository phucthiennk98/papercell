import { createPlatePlugin, PlateElement, PlateLeaf, type PlateElementProps, type PlateLeafProps, useReadOnly } from 'platejs/react'
import {
  BlockquotePlugin, BoldPlugin, CodePlugin, H1Plugin, H2Plugin, H3Plugin, HorizontalRulePlugin,
  ItalicPlugin, StrikethroughPlugin, SubscriptPlugin, SuperscriptPlugin, UnderlinePlugin,
} from '@platejs/basic-nodes/react'
import { TextAlignPlugin } from '@platejs/basic-styles/react'
import { IndentPlugin } from '@platejs/indent/react'
import { ColumnItemPlugin, ColumnPlugin } from '@platejs/layout/react'
import { PythonCellElement } from './PythonCell'

const TEXT_BLOCKS = ['p', 'h1', 'h2', 'h3', 'blockquote']

const el = (as: string) => (props: PlateElementProps) => <PlateElement as={as as any} {...props} />
const leaf = (as: string) => (props: PlateLeafProps) => <PlateLeaf as={as as any} {...props} />

function ColumnGroupElement(props: PlateElementProps) {
  return <PlateElement {...props} className="pc-columns">{props.children}</PlateElement>
}

function ColumnElement(props: PlateElementProps) {
  const readOnly = useReadOnly()
  const width = (props.element as any).width ?? '50%'
  return (
    <PlateElement {...props} className={'pc-column' + (readOnly ? '' : ' is-edit')} style={{ flexBasis: width, width }}>
      {props.children}
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
]
