// Trợ lý viết bài ở sidebar phải: trả lời dạng stream, có ngữ cảnh là nội dung bài đang mở.
import { streamText } from 'ai'
import { ConfigError, readConfig, resolveModel } from './provider'

const SYSTEM = `You are the writing assistant in Papercell, an editor for scientific papers with figures drawn in JS and the author's original Python code.
Reply in the language the user writes in. Write clearly, in an academic register when drafting document content.
When asked to write or edit content, return only that content in Markdown so it can be inserted directly, with no preamble.
When asked about code, explain briefly and give complete code.
Never invent data or references; if the document has no data for something, say so.`

type Msg = { role: 'user' | 'assistant'; content: string }

export async function assistantChat(req: Request) {
  const body = await req.json()
  const messages = (Array.isArray(body.messages) ? body.messages : []).filter(
    (m: Msg) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim(),
  ) as Msg[]
  if (!messages.length) return Response.json({ error: 'No question was sent.' }, { status: 400 })

  let model
  try { model = resolveModel(readConfig(body)) }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: e instanceof ConfigError ? 401 : 500 }) }

  const doc = typeof body.doc === 'string' ? body.doc.slice(0, 200_000) : ''
  const system = doc ? `${SYSTEM}\n\nThe open document (Markdown):\n<document>\n${doc}\n</document>` : SYSTEM

  const result = streamText({
    model,
    system,
    messages,
    maxOutputTokens: 16000,
    maxRetries: 1,
    abortSignal: req.signal,
    // Lỗi được gửi về giao diện (xem bên dưới), không in nguyên stack ra console
    onError: ({ error }) => console.warn('[assistant]', describe(error)),
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
/** Dòng trạng thái tiến độ: PROGRESS_MARK + chữ + xuống dòng. */
export const PROGRESS_MARK = '\u0000P:'

export function describe(e: unknown): string {
  // Lỗi sau nhiều lần thử lại: lấy lỗi cuối cùng
  const outer = e as { lastError?: unknown }
  const err = (outer?.lastError ?? e) as { message?: string; statusCode?: number; cause?: { message?: string; code?: string } }
  if (/Cannot connect to API/i.test(err?.message ?? '')) return 'Could not connect to the server address you entered.'
  const cause = err?.cause?.code === 'ECONNREFUSED' || /ECONNREFUSED|fetch failed/.test(err?.message ?? '') ? 'Could not connect to the server address you entered.' : ''
  if (err?.statusCode === 401 || err?.statusCode === 403) return 'The provider rejected the key (401/403). Check your API key.'
  if (err?.statusCode === 404) return 'Model or address not found (404). Check the model name and base URL.'
  return cause || err?.message || String(e)
}
