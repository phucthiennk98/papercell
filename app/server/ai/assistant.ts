// Trợ lý viết bài ở sidebar phải: trả lời dạng stream, có ngữ cảnh là nội dung bài đang mở.
import { streamText } from 'ai'
import { ConfigError, readConfig, resolveModel } from './provider'

const SYSTEM = `Bạn là trợ lý viết bài khoa học trong Papercell, một trình soạn bài báo có hình vẽ bằng JS và code Python gốc của tác giả.
Trả lời bằng ngôn ngữ người dùng đang dùng (mặc định tiếng Việt). Viết rõ ràng, đúng văn phong học thuật khi soạn nội dung bài.
Khi người dùng nhờ viết hoặc sửa nội dung, trả về đúng phần nội dung bằng Markdown để có thể chèn thẳng vào bài, không kèm lời dẫn.
Khi được hỏi về code, giải thích ngắn gọn và đưa code hoàn chỉnh.
Không bịa số liệu hay tài liệu tham khảo; nếu bài chưa có dữ liệu thì nói rõ.`

type Msg = { role: 'user' | 'assistant'; content: string }

export async function assistantChat(req: Request) {
  const body = await req.json()
  const messages = (Array.isArray(body.messages) ? body.messages : []).filter(
    (m: Msg) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim(),
  ) as Msg[]
  if (!messages.length) return Response.json({ error: 'Chưa có câu hỏi.' }, { status: 400 })

  let model
  try { model = resolveModel(readConfig(body)) }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: e instanceof ConfigError ? 401 : 500 }) }

  const doc = typeof body.doc === 'string' ? body.doc.slice(0, 200_000) : ''
  const system = doc ? `${SYSTEM}\n\nNội dung bài đang mở (Markdown):\n<bai_viet>\n${doc}\n</bai_viet>` : SYSTEM

  const result = streamText({
    model,
    system,
    messages,
    maxOutputTokens: 16000,
    maxRetries: 1,
    abortSignal: req.signal,
    // Lỗi được gửi về giao diện (xem bên dưới), không in nguyên stack ra console
    onError: ({ error }) => console.warn('[trợ lý]', describe(error)),
  })

  // Gửi chữ dạng stream; lỗi của nhà cung cấp được gửi kèm sau dấu ERROR_MARK để giao diện hiện rõ.
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const fail = (e: unknown) => ctrl.enqueue(enc.encode(ERROR_MARK + describe(e)))
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') ctrl.enqueue(enc.encode(part.text))
          else if (part.type === 'error') fail(part.error)
        }
      } catch (e) { if (!req.signal.aborted) fail(e) }
      ctrl.close()
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

export const ERROR_MARK = '\u0000ERR:'

export function describe(e: unknown): string {
  // Lỗi sau nhiều lần thử lại: lấy lỗi cuối cùng
  const outer = e as { lastError?: unknown }
  const err = (outer?.lastError ?? e) as { message?: string; statusCode?: number; cause?: { message?: string; code?: string } }
  if (/Cannot connect to API/i.test(err?.message ?? '')) return 'Không kết nối được tới địa chỉ server đã nhập.'
  const cause = err?.cause?.code === 'ECONNREFUSED' || /ECONNREFUSED|fetch failed/.test(err?.message ?? '') ? 'Không kết nối được tới địa chỉ server đã nhập.' : ''
  if (err?.statusCode === 401 || err?.statusCode === 403) return 'Nhà cung cấp từ chối key (401/403). Kiểm tra lại API key.'
  if (err?.statusCode === 404) return 'Không tìm thấy model hoặc địa chỉ (404). Kiểm tra tên model và địa chỉ.'
  return cause || err?.message || String(e)
}
