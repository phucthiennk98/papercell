// One-shot AI request (API key or local agent, whichever the user configured in the AI Assistant).
import { aiStore } from './store'

/** Must match server/ai/assistant.ts */
export const ERROR_MARK = '\u0000ERR:'
export const PROGRESS_MARK = '\u0000P:'

/** Split progress lines and errors out of the streamed answer text. */
export function parseStream(raw: string): { content: string; progress: string; error?: string } {
  let content = '', progress = '', i = 0
  for (;;) {
    const p = raw.indexOf(PROGRESS_MARK, i), e = raw.indexOf(ERROR_MARK, i)
    const next = [p, e].filter((x) => x >= 0).sort((a, b) => a - b)[0]
    if (next === undefined) { content += raw.slice(i); break }
    content += raw.slice(i, next)
    if (next === e) return { content, progress, error: raw.slice(e + ERROR_MARK.length) || 'The provider returned an error.' }
    const nl = raw.indexOf('\n', p + PROGRESS_MARK.length)
    if (nl < 0) break // progress line not complete yet
    progress = raw.slice(p + PROGRESS_MARK.length, nl)
    i = nl + 1
  }
  return { content: content.replace(/^\s+/, ''), progress }
}

export type AskOptions = {
  messages: { role: 'user' | 'assistant'; content: string }[]
  /** Context given to the model (the server appends it to the system prompt / writes it to a file for agents). */
  doc: string
  signal: AbortSignal
  onUpdate?: (s: { content: string; progress: string }) => void
}

/** Send a conversation and stream the reply; resolves with the full answer text. */
export async function askAI({ messages, doc, signal, onUpdate }: AskOptions): Promise<string> {
  const { mode, agent, config } = aiStore.get()
  if (mode === 'agent' && !agent) throw new Error('No local agent selected. Open the AI Assistant panel to set one up.')
  const r = await fetch(mode === 'agent' ? '/api/agents/chat' : '/api/assistant/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal,
    body: JSON.stringify(mode === 'agent' ? { agent, messages, doc } : { aiConfig: config, messages, doc }),
  })
  if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Error ${r.status}`) }
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let raw = '', content = ''
  for (;;) {
    const { value, done } = await reader.read(); if (done) break
    raw += value
    const s = parseStream(raw)
    if (s.error) throw new Error(s.error)
    content = s.content
    onUpdate?.({ content, progress: s.progress })
  }
  if (!content.trim()) throw new Error('No answer received. Check the model and API key in the AI Assistant settings.')
  return content
}
