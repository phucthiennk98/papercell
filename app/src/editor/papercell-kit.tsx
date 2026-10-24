import { createPlatePlugin } from 'platejs/react'
import { EditorKit } from '@/components/editor/editor-kit'
import { FigureElement } from '@/figure/FigureElement'
import { DocHeader } from './DocHeader'

/** Papercell interactive JS figure card: void block with parameters, dialog, and Python verification. */
export const FigurePlugin = createPlatePlugin({
  key: 'figure',
  node: { isElement: true, isVoid: true, component: FigureElement },
})

/** Document title bar rendered right below Plate's fixed toolbar. */
export const DocHeaderPlugin = createPlatePlugin({ key: 'docHeader', render: { beforeEditable: () => <DocHeader /> } })

/** Complete Plate editor kit combined with Papercell custom blocks. */
export const PapercellKit = [...EditorKit, FigurePlugin, DocHeaderPlugin]
