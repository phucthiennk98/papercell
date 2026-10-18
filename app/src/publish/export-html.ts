// Xuất một file HTML mở được ở mọi nơi: trang đọc (viewer) + bài viết nén (gzip + base64) nhúng bên trong.
import { toast } from 'sonner'
import type { DataFile, DocMeta, FigureNode } from '@/editor/types'
import { formatBytes } from '@/figure/scenarios'
import { packText } from '@/lib/pack'

/** Bản cho người đọc: bỏ hình ẩn, bỏ Python gốc nếu tác giả không cho xem, bỏ dữ liệu nội bộ của trình soạn. */
function forPublish(nodes: any[]): any[] {
  return nodes.flatMap((n) => {
    if (n.type !== 'figure') return [n.children ? { ...n, children: forPublish(n.children) } : n]
    const f = n as FigureNode
    if (f.display === 'hidden') return []
    const { verify, spec, specDetached, autoOpen, ...rest } = f // eslint-disable-line @typescript-eslint/no-unused-vars
    return [{ ...rest, python: f.codeAccess === 'python' || f.codeAccess === 'both' ? f.python : '' }]
  })
}

/** Tên file an toàn: bỏ dấu tiếng Việt, chỉ giữ chữ số và gạch ngang. */
export const docSlug = (title: string) => title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'bai-viet'

export async function exportDocHtml({ meta, files, content }: { meta: DocMeta; files: DataFile[]; content: any[] }) {
  const id = toast.loading('Packing the HTML file…')
  try {
    const res = await fetch('/viewer.html', { cache: 'no-store' })
    let html = res.ok ? await res.text() : ''
    if (!html.includes('>__PC_DOC__<') || html.includes('/src/viewer/')) throw new Error('This is a dev build without the packaged reader page. Run the production build and export again.')
    const { b64 } = await packText(JSON.stringify({ version: 3, meta, data: files, content: forPublish(content) }))
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
    html = html.replace('>__PC_DOC__<', () => '>' + b64 + '<').replace('<title>Papercell</title>', () => `<title>${esc(meta.title || 'Papercell')}</title>`)
    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = docSlug(meta.title) + '.html'
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    toast.success(`Exported ${a.download} (${formatBytes(blob.size)}). Opens in any browser, nothing to install.`, { id })
  } catch (e) {
    toast.error((e as Error).message, { id })
  }
}
