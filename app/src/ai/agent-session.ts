import type { AgentEvent, AgentId, AgentModel } from '../../server/agents/drivers/types'

export type { AgentEvent, AgentModel }
export type AgentSession = { id: string; agent: AgentId; model?: string; effort?: string }
export type SessionOptions = { agent: string; model?: string; effort?: string }

export class AgentSessionError extends Error {
  constructor(message: string, public status?: number, public fatal = false) {
    super(message)
    this.name = 'AgentSessionError'
  }
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch('/api/agents' + path, init)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new AgentSessionError(body.error || `Error ${response.status}`, response.status)
  }
  return response
}

const json = (body: unknown): RequestInit => ({
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

export async function fetchAgentModels(agent: string, refresh = false): Promise<{ models: AgentModel[]; warning?: string }> {
  return (await request(`/models?agent=${encodeURIComponent(agent)}${refresh ? '&refresh=1' : ''}`)).json()
}

export async function createSession(options: SessionOptions): Promise<AgentSession> {
  return (await request('/sessions', json(options))).json()
}

export async function listSessions(): Promise<{ sessions: (AgentSession & { alive: boolean; busy: boolean; lastUsed: number })[] }> {
  return (await request('/sessions')).json()
}

export async function interruptSession(id: string): Promise<void> {
  await request(`/sessions/${encodeURIComponent(id)}/interrupt`, { method: 'POST' })
}

export async function closeSession(id: string): Promise<void> {
  await request(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function runTurn(
  id: string,
  turn: {
    text: string
    doc: string
    attachments?: {
      name: string
      kind: 'image' | 'file'
      dataUrl?: string
      textContent?: string
    }[]
  },
  { signal, onEvent }: { signal: AbortSignal; onEvent: (event: AgentEvent) => void },
): Promise<void> {
  const response = await request(`/sessions/${encodeURIComponent(id)}/turn`, { ...json(turn), signal })
  if (!response.body) throw new AgentSessionError('No response stream received.')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let pending = '', terminal = false
  const line = (raw: string) => {
    if (!raw.trim()) return
    let event: AgentEvent
    try { event = JSON.parse(raw) }
    catch { throw new AgentSessionError('The agent returned an invalid event.') }
    if (!event || !['text', 'step', 'tool', 'done', 'error'].includes(event.type)) {
      throw new AgentSessionError('The agent returned an unknown event.')
    }
    if ((event.type === 'text' && typeof event.delta !== 'string') ||
      (event.type === 'step' && typeof event.text !== 'string') ||
      (event.type === 'tool' && (typeof event.name !== 'string' || (event.detail !== undefined && typeof event.detail !== 'string'))) ||
      (event.type === 'error' && typeof event.message !== 'string')) {
      throw new AgentSessionError('The agent returned an invalid event.')
    }
    onEvent(event)
    if (event.type === 'error') throw new AgentSessionError(event.message, undefined, event.fatal)
    if (event.type === 'done') terminal = true
  }
  try {
    while (!terminal) {
      const { value, done } = await reader.read()
      if (done) { if (pending.trim()) line(pending); break }
      pending += value
      let end: number
      while (!terminal && (end = pending.indexOf('\n')) >= 0) {
        const raw = pending.slice(0, end)
        pending = pending.slice(end + 1)
        line(raw)
      }
    }
    if (!terminal) throw new AgentSessionError('The agent stream ended before the turn finished.')
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
