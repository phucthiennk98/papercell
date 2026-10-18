import { createPlatePlugin } from 'platejs/react'
import { EditorKit } from '@/components/editor/editor-kit'
import { FigureElement } from '@/figure/FigureElement'
import { DocHeader } from './DocHeader'

/** Thẻ hình JS của Papercell: khối void, có tham số, popup và kiểm chứng. */
export const FigurePlugin = createPlatePlugin({
  key: 'figure',
  node: { isElement: true, isVoid: true, component: FigureElement },
})

/** Tiêu đề bài, vẽ ngay sau thanh công cụ cố định của Plate. */
export const DocHeaderPlugin = createPlatePlugin({ key: 'docHeader', render: { beforeEditable: () => <DocHeader /> } })

/** Toàn bộ bộ editor của Plate cộng các khối riêng của Papercell. */
export const PapercellKit = [...EditorKit, FigurePlugin, DocHeaderPlugin]
