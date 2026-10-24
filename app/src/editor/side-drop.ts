// Drop a dragged block on the left/right edge of another block to put them side by side (Notion-style).
// Plate's block drag handle only drops above/below; this adds the side zones and builds column groups.
import { useSyncExternalStore } from 'react'
import { PathApi, type Path, type TElement } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { newId } from './types'

export type Side = 'left' | 'right'
type Target = { id: string; side: Side } | null

const MAX_COLUMNS = 4
const GROUP = 'column_group'
const COLUMN = 'column'

// ---- Which block edge is being hovered while dragging (shared by every block) ----
let current: Target = null
const listeners = new Set<() => void>()
export const sideTarget = {
  get: () => current,
  set(t: Target) {
    if (t?.id === current?.id && t?.side === current?.side) return
    current = t; listeners.forEach((l) => l())
  },
}
// Drag cancelled or finished anywhere: forget the hovered edge
if (typeof window !== 'undefined') {
  window.addEventListener('dragend', () => sideTarget.set(null))
  window.addEventListener('drop', () => setTimeout(() => sideTarget.set(null), 0))
}

export function useSideTarget(id: string | undefined): Side | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => (id && current?.id === id ? current.side : null),
  )
}

/** Left or right edge zone of a block (middle 56% vertically, 14% width up to 52px), or null when aiming for top/bottom insertion. */
export function sideOf(clientX: number, clientY: number, rect: DOMRect): Side | null {
  if (rect.height > 36) {
    const yRatio = (clientY - rect.top) / rect.height
    if (yRatio < 0.22 || yRatio > 0.78) return null
  }
  const zone = Math.min(52, rect.width * 0.14)
  if (clientX < rect.left + zone) return 'left'
  if (clientX > rect.right - zone) return 'right'
  return null
}

const findById = (editor: PlateEditor, id: string) =>
  editor.api.node<TElement>({ at: [], mode: 'all', match: (n) => (n as TElement).id === id })

function equalize(editor: PlateEditor, groupPath: Path) {
  const group = editor.api.node<TElement>(groupPath)?.[0]
  if (!group) return
  const n = group.children.length
  group.children.forEach((_, i) => editor.tf.setNodes({ width: `${+(100 / n).toFixed(2)}%` } as Partial<TElement>, { at: [...groupPath, i] }))
}

/** Can the target take another column on its side? */
export function canDropSide(editor: PlateEditor, targetId: string, dragIds: string[] = []): boolean {
  if (!targetId || dragIds.includes(targetId)) return false
  const t = findById(editor, targetId)
  if (!t) return false
  const [node, path] = t
  if (node.type === GROUP) return false

  if (dragIds.length) {
    const dragged = dragIds.map((id) => findById(editor, id)).filter((e): e is NonNullable<typeof e> => !!e)
    for (const [dn, dp] of dragged) {
      if (dn.type === COLUMN) return false
      if (PathApi.isAncestor(dp, path) || PathApi.isAncestor(path, dp)) return false
      // Blocks in the same column reorder vertically; do not split them into a new column when dragging up/down
      if (dp.length === 3 && path.length === 3 && PathApi.equals(PathApi.parent(dp), PathApi.parent(path))) {
        return false
      }
    }
  }

  const parent = path.length > 1 ? editor.api.node<TElement>(PathApi.parent(path)) : undefined
  if (parent?.[0].type === COLUMN) {
    const group = editor.api.node<TElement>(PathApi.parent(parent[1]))?.[0]
    return !!group && group.children.length < MAX_COLUMNS
  }
  return path.length === 1
}

/** Move the dragged blocks next to the target block, creating or extending a column group. */
export function dropToSide(editor: PlateEditor, dragIds: string[], targetId: string, side: Side) {
  if (dragIds.includes(targetId) || !canDropSide(editor, targetId, dragIds)) return false
  const dragged = dragIds.map((id) => findById(editor, id)).filter((e): e is NonNullable<typeof e> => !!e)
  if (!dragged.length) return false
  // A block cannot be dropped beside something inside itself
  const target0 = findById(editor, targetId)!
  if (dragged.some(([, p]) => PathApi.isAncestor(p, target0[1]))) return false
  const moved = dragged.map(([n]) => n)
  const col = (children: TElement[]) => ({ type: COLUMN, id: newId(), width: '', children }) as unknown as TElement

  editor.tf.withoutNormalizing(() => {
    // Remove the dragged blocks first (last path first), then find the target again by id
    dragged.map(([, p]) => p).sort(PathApi.compare).reverse().forEach((p) => editor.tf.removeNodes({ at: p }))
    const t = findById(editor, targetId)
    if (!t) return
    const [node, path] = t
    const parent = path.length > 1 ? editor.api.node<TElement>(PathApi.parent(path)) : undefined
    if (node.type === GROUP) {
      editor.tf.insertNodes(col(moved), { at: [...path, side === 'left' ? 0 : node.children.length] })
      equalize(editor, path)
    } else if (parent?.[0].type === COLUMN) {
      const colPath = parent[1]
      editor.tf.insertNodes(col(moved), { at: side === 'left' ? colPath : PathApi.next(colPath) })
      equalize(editor, PathApi.parent(colPath))
    } else {
      editor.tf.removeNodes({ at: path })
      const group = { type: GROUP, id: newId(), children: side === 'left' ? [col(moved), col([node])] : [col([node]), col(moved)] } as unknown as TElement
      editor.tf.insertNodes(group, { at: path })
      equalize(editor, path)
    }
  })
  return true
}

/** Move dragged blocks (or an entire column's blocks) out to full-width above or below a target block (or column_group), cleaning up any emptied column_group. */
export function moveToColumnGroupEdge(
  editor: PlateEditor,
  dragIds: string[],
  targetElement: TElement,
  edge: 'top' | 'bottom',
): boolean {
  const dragged = dragIds.map((id) => findById(editor, id)).filter((e): e is NonNullable<typeof e> => !!e)
  if (!dragged.length) return false
  const moved: TElement[] = []
  const sourceGroupIds = new Set<string>()
  if (targetElement.type === GROUP && typeof targetElement.id === 'string') {
    sourceGroupIds.add(targetElement.id)
  }
  for (const [n, p] of dragged) {
    if (n.type === COLUMN && Array.isArray(n.children)) {
      moved.push(...(n.children as TElement[]))
    } else {
      moved.push(n)
    }
    if (p.length >= 2) {
      const grp = editor.api.node<TElement>(p.slice(0, 1))?.[0]
      if (grp?.type === GROUP && typeof grp.id === 'string') {
        sourceGroupIds.add(grp.id)
      }
    }
  }
  if (!moved.length) return false

  editor.tf.withoutNormalizing(() => {
    const findNode = (el: TElement) =>
      (el.id ? findById(editor, el.id as string) : undefined) ??
      (() => {
        const p = editor.api.findPath(el)
        return p ? editor.api.node<TElement>(p) : undefined
      })()

    dragged.map(([, p]) => p).sort(PathApi.compare).reverse().forEach((p) => editor.tf.removeNodes({ at: p }))

    const t = findNode(targetElement)
    if (!t) return
    const [, targetPath] = t
    const insertAt = edge === 'top' ? targetPath : PathApi.next(targetPath)
    editor.tf.insertNodes(moved, { at: insertAt })

    for (const gid of sourceGroupIds) {
      const gAfter = findById(editor, gid)
      if (!gAfter) continue
      const [groupNode, newGroupPath] = gAfter
      for (let i = groupNode.children.length - 1; i >= 0; i--) {
        const colNode = groupNode.children[i] as TElement
        if (!colNode.children || colNode.children.length === 0) {
          editor.tf.removeNodes({ at: [...newGroupPath, i] })
        }
      }

      const gFinal = findById(editor, gid)
      if (!gFinal) continue
      const [finalGroup, finalPath] = gFinal
      if (finalGroup.children.length === 0) {
        editor.tf.removeNodes({ at: finalPath })
      } else if (finalGroup.children.length === 1) {
        const remainingCol = finalGroup.children[0] as TElement
        const remainingChildren = (remainingCol.children ?? []) as TElement[]
        editor.tf.removeNodes({ at: finalPath })
        if (remainingChildren.length) {
          editor.tf.insertNodes(remainingChildren, { at: finalPath })
        }
      } else {
        equalize(editor, finalPath)
      }
    }
  })
  return true
}
