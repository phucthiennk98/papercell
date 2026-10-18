import type { TElement } from 'platejs'
import { type PlateElementProps, type RenderNodeWrapper, useReadOnly } from 'platejs/react'
import { useDraggable, useDropLine } from '@platejs/dnd'
import { GripVertical, Plus } from 'lucide-react'
import { openSlash } from './SlashMenu'

/** Bọc mỗi khối cấp cao nhất (và khối nằm trong cột) bằng tay cầm kéo + nút chèn. */
export const BlockDraggable: RenderNodeWrapper = (props) => {
  const { editor, element, path } = props
  const parent = path.length > 1 ? (editor.api.node(path.slice(0, -1))?.[0] as TElement | undefined) : undefined
  const inColumn = parent?.type === 'column'
  if (element.type === 'column') return
  if (path.length !== 1 && !inColumn) return
  return (p) => <Draggable {...p} />
}

function Draggable(props: PlateElementProps) {
  const { editor, element, children } = props
  const readOnly = useReadOnly()
  const { isDragging, nodeRef, handleRef } = useDraggable({ element })
  if (readOnly) return <>{children}</>
  return (
    <div className={'blk' + (isDragging ? ' is-dragging' : '')}>
      <div className="blk-gutter" contentEditable={false}>
        <button type="button" className="blk-btn" aria-label="Chèn khối bên dưới" data-tip="Chèn khối"
          onMouseDown={(e) => { e.preventDefault(); const at = editor.api.findPath(element); if (at) openSlash(editor, at, 'after') }}>
          <Plus size={15} />
        </button>
        <button type="button" ref={handleRef} className="blk-btn blk-handle" aria-label="Kéo để di chuyển khối" data-tip="Kéo để di chuyển">
          <GripVertical size={15} />
        </button>
      </div>
      <div ref={nodeRef} className="blk-body">{children}</div>
      <DropLine id={element.id as string} />
    </div>
  )
}

function DropLine({ id }: { id: string }) {
  const { dropLine } = useDropLine({ id })
  if (!dropLine) return null
  return <div className={'blk-drop ' + dropLine} contentEditable={false} />
}
