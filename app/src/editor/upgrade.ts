// Nâng cấp tài liệu khi mở: áp các bản sửa của trình tạo biểu đồ và chữa hình bị ghi đè nhầm.
import { makeGallery } from '@/gallery'
import { codegen } from '@/figure/builder'
import type { FigureNode, PapercellDoc } from './types'

const GALLERY_TITLE = 'Bộ thử biểu đồ'

function mapFigures(nodes: any[], fn: (f: FigureNode) => FigureNode): any[] {
  return nodes.map((n) => (n.type === 'figure' ? fn(n as FigureNode) : n.children ? { ...n, children: mapFigures(n.children, fn) } : n))
}

function collect(nodes: any[], out = new Map<string, FigureNode>()) {
  // Theo chú thích (mỗi hình trong bộ thử có chú thích riêng); id có thể lệch giữa các phiên bản bộ thử
  nodes.forEach((n) => { if (n.type === 'figure') out.set(n.caption, n); else if (n.children) collect(n.children, out) })
  return out
}

export function upgradeDoc(doc: PapercellDoc): PapercellDoc {
  // Hình viết code tay của bộ thử từng bị tab Thiết kế ghi đè (lỗi đã sửa): đưa về bản gốc
  const original = doc.meta.title === GALLERY_TITLE ? collect(makeGallery().content) : null
  return {
    ...doc,
    content: mapFigures(doc.content, (f) => {
      const o = original?.get(f.caption)
      if (o && !o.spec && f.spec && !f.codeBackup) return { ...o, id: f.id }
      // Hình tạo bằng Thiết kế, chưa sửa tay: sinh lại code để nhận bản sửa mới của trình tạo biểu đồ
      if (f.spec && !f.specDetached) {
        const js = codegen(f.spec)
        if (js !== f.js) return { ...f, js }
      }
      return f
    }),
  }
}
