// Interactive figure card wrapper for the exported HTML viewer: supports sliders and detail dialog.
import { createSlatePlugin } from 'platejs'
import { SlateElement, type SlateElementProps } from 'platejs/static'
import type { FigureNode } from '@/editor/types'
import { FigureCard, figClass } from './FigureElement'

export function FigureElementStatic(props: SlateElementProps) {
  const fig = props.element as unknown as FigureNode
  // Strip Plate's data-slate-* attributes so full figure source code is not duplicated in DOM attributes.
  const attributes = Object.fromEntries(Object.entries(props.attributes).filter(([k]) => !k.startsWith('data-slate-') || /^data-slate-(node|void|type|id)$/.test(k))) as typeof props.attributes
  return (
    <SlateElement {...props} attributes={attributes} className={figClass(fig, true)}>
      {fig.display === 'hidden' ? null : <FigureCard fig={fig} readOnly update={() => {}} />}
      {props.children}
    </SlateElement>
  )
}

export const FigureStaticPlugin = createSlatePlugin({
  key: 'figure',
  node: { isElement: true, isVoid: true, component: FigureElementStatic },
})
