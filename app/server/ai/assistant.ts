// Right-sidebar writing assistant: streams responses with the active article as context.
import { streamText } from 'ai'
import { ConfigError, readConfig, resolveModel } from './provider'

const SYSTEM = `You are the writing assistant in Papercell, an editor for scientific papers with figures drawn in JS and the author's original Python code.
Reply in the language the user writes in. Write clearly, in an academic register when drafting document content.
When asked to write or edit content, return only that content in Markdown so it can be inserted directly, with no preamble.
When asked to create, add, or insert a chart/figure/plot, output a fenced \`\`\`papercell-figure\`\`\` JSON block with "caption", "spec", "params" (interactive controls/sliders), "js" (Observable Plot / D3 code reading data.<dataset> and params.<key>), and "python" so clicking Insert creates a live interactive FigureNode card in the document.
When asked to write or edit a mathematical formula/equation, output a display math block wrapped in \`$$ ... $$\` using clean KaTeX syntax with explicit braces around fractions (\`\\frac{a}{b}\`), superscripts (\`x^{n}\`), subscripts (\`x_{i}\`), and roots (\`\\sqrt{x}\`) so every number and symbol is directly clickable in Papercell's Visual Formula Editor.
When asked about code, explain briefly and give complete code.
Never invent data or references; if the document has no data for something, say so.`

type RawAttachment = {
  name?: string
  kind?: 'image' | 'file'
  mimeType?: string
  dataUrl?: string
  textContent?: string
}

type Msg = {
  role: 'user' | 'assistant'
  content: string
  attachments?: RawAttachment[]
}

export async function assistantChat(req: Request) {
  const body = await req.json()
  const rawMessages = (Array.isArray(body.messages) ? body.messages : []).filter(
    (m: Msg) =>
      (m.role === 'user' || m.role === 'assistant') &&
      ((typeof m.content === 'string' && m.content.trim()) ||
        (Array.isArray(m.attachments) && m.attachments.length > 0)),
  ) as Msg[]
  if (!rawMessages.length) return Response.json({ error: 'No question was sent.' }, { status: 400 })

  const messages = rawMessages.map((m) => {
    const atts = Array.isArray(m.attachments) ? m.attachments : []
    if (m.role !== 'user' || atts.length === 0) {
      return { role: m.role, content: m.content }
    }
    const fileBlocks = atts
      .filter((a) => a.kind === 'file' && typeof a.textContent === 'string' && a.textContent.trim())
      .map((a) => `<reference_file name="${a.name || 'file'}">\n${a.textContent!.slice(0, 40_000)}\n</reference_file>`)
    const fullText = [
      ...fileBlocks,
      m.content?.trim() || 'Analyze the attached reference(s).',
    ].join('\n\n')

    const images = atts.filter(
      (a) => a.kind === 'image' && typeof a.dataUrl === 'string' && a.dataUrl.startsWith('data:image/'),
    )
    if (images.length === 0) {
      return { role: 'user' as const, content: fullText }
    }
    return {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: fullText },
        ...images.map((img) => ({ type: 'image' as const, image: img.dataUrl! })),
      ],
    }
  })

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
    // Errors are forwarded to the UI stream below rather than dumping full stack traces to the console
    onError: ({ error }) => console.warn('[assistant]', describe(error)),
  })

  // Stream text chunks; provider errors are appended after ERROR_MARK so the UI can display them clearly.
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
/** Progress status line: PROGRESS_MARK + label + newline. */
export const PROGRESS_MARK = '\u0000P:'

export function describe(e: unknown): string {
  // Retry exhausted: unwrap the last underlying error
  const outer = e as { lastError?: unknown }
  const err = (outer?.lastError ?? e) as { message?: string; statusCode?: number; cause?: { message?: string; code?: string } }
  if (/Cannot connect to API/i.test(err?.message ?? '')) return 'Could not connect to the server address you entered.'
  const cause = err?.cause?.code === 'ECONNREFUSED' || /ECONNREFUSED|fetch failed/.test(err?.message ?? '') ? 'Could not connect to the server address you entered.' : ''
  if (err?.statusCode === 401 || err?.statusCode === 403) return 'The provider rejected the key (401/403). Check your API key.'
  if (err?.statusCode === 404) return 'Model or address not found (404). Check the model name and base URL.'
  return cause || err?.message || String(e)
}
