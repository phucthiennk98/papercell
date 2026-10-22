// Server Papercell: route AI của Plate, (sau này) MCP, và phát giao diện đã build.
import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { POST as aiCommand } from './ai/command/route'
import { POST as aiCopilot } from './ai/copilot/route'
import { getConnInfo } from '@hono/node-server/conninfo'
import { assistantChat, ERROR_MARK, PROGRESS_MARK } from './ai/assistant'
import { agentChat, detectAgents } from './agents/local'
import { isAgentId } from './agents/drivers'
import { listAgentModels } from './agents/models'
import { closeSession, createSession, interrupt, listSessions, runTurn, SessionError } from './agents/session'
import { detectPython, runGrid } from './python/grid'
import { listModels, readConfig, serverKeys } from './ai/provider'

const app = new Hono()

app.get('/api/health', (c) => c.json({ ok: true }))
app.post('/api/ai/command', (c) => aiCommand(c.req.raw))
app.post('/api/ai/copilot', (c) => aiCopilot(c.req.raw))
app.post('/api/assistant/chat', (c) => assistantChat(c.req.raw))
// Agent trên máy: chỉ cho phép yêu cầu từ chính máy này (trừ khi bật PAPERCELL_ALLOW_REMOTE_AGENTS=1)
const isLocal = (c: Parameters<typeof getConnInfo>[0]) => {
  if (process.env.PAPERCELL_ALLOW_REMOTE_AGENTS === '1') return true
  const ip = getConnInfo(c).remote.address ?? ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}
app.get('/api/agents', async (c) => {
  if (!isLocal(c)) return c.json({ agents: [], inDocker: existsSync('/.dockerenv'), note: existsSync('/.dockerenv')
    ? 'You are using the Docker build, and the container cannot see agents installed on your computer. Double-click chay-tren-may.bat in the project folder, then open http://localhost:8780.'
    : 'Local agents only work when Papercell is opened on the computer running the server.' })
  return c.json({ agents: await detectAgents(c.req.query('refresh') === '1') })
})
const validOption = (v: unknown) => v === undefined || (typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(v))
const errorMessage = (e: unknown) => e instanceof Error ? e.message : String(e)
app.get('/api/agents/models', async (c) => {
  if (!isLocal(c)) return c.json({ error: 'Local agents can only be used from the computer running the server.' }, 403)
  const agent = c.req.query('agent')
  if (!isAgentId(agent)) return c.json({ error: 'Choose a valid local agent.' }, 400)
  return c.json(await listAgentModels(agent, c.req.query('refresh') === '1'))
})
app.get('/api/agents/sessions', (c) => {
  if (!isLocal(c)) return c.json({ error: 'Local agents can only be used from the computer running the server.' }, 403)
  return c.json({ sessions: listSessions() })
})
app.post('/api/agents/sessions', async (c) => {
  if (!isLocal(c)) return c.json({ error: 'Local agents can only be used from the computer running the server.' }, 403)
  const b = await c.req.json().catch(() => null)
  if (!b || !isAgentId(b.agent)) return c.json({ error: 'Choose a valid local agent.' }, 400)
  if (!validOption(b.model) || !validOption(b.effort)) return c.json({ error: 'Invalid model or reasoning effort.' }, 400)
  try { return c.json(await createSession({ agent: b.agent, model: b.model, effort: b.effort })) }
  catch (e) { return c.json({ error: errorMessage(e) }, e instanceof SessionError ? e.status : 502) }
})
app.post('/api/agents/sessions/:id/turn', async (c) => {
  if (!isLocal(c)) return c.json({ error: 'Local agents can only be used from the computer running the server.' }, 403)
  const b = await c.req.json().catch(() => null)
  if (!b || typeof b.text !== 'string' || !b.text.trim()) return c.json({ error: 'No question was sent.' }, 400)
  try {
    const stream = runTurn(c.req.param('id'), b.text, typeof b.doc === 'string' ? b.doc.slice(0, 500_000) : '', c.req.raw.signal)
    return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-cache' } })
  } catch (e) { return c.json({ error: errorMessage(e) }, e instanceof SessionError ? e.status : 500) }
})
app.post('/api/agents/sessions/:id/interrupt', async (c) => {
  if (!isLocal(c)) return c.json({ error: 'Local agents can only be used from the computer running the server.' }, 403)
  try { await interrupt(c.req.param('id')); return c.json({ ok: true }) }
  catch (e) { return c.json({ error: errorMessage(e) }, e instanceof SessionError ? e.status : 500) }
})
app.delete('/api/agents/sessions/:id', async (c) => {
  if (!isLocal(c)) return c.json({ error: 'Local agents can only be used from the computer running the server.' }, 403)
  try { await closeSession(c.req.param('id')); return c.json({ ok: true }) }
  catch (e) { return c.json({ error: errorMessage(e) }, e instanceof SessionError ? e.status : 500) }
})
app.post('/api/agents/chat', async (c) => {
  if (!isLocal(c)) return c.json({ error: 'Local agents can only be used from the computer running the server.' }, 403)
  const b = await c.req.json().catch(() => null)
  if (!b || !isAgentId(b.agent)) return c.json({ error: 'Choose a valid local agent.' }, 400)
  if (!validOption(b.model) || !validOption(b.effort)) return c.json({ error: 'Invalid model or reasoning effort.' }, 400)
  const messages = (Array.isArray(b.messages) ? b.messages : []).filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  if (!messages.length) return c.json({ error: 'No question was sent.' }, 400)
  if (!messages.some((m: any) => m.role === 'user' && m.content.trim())) return c.json({ error: 'No question was sent.' }, 400)
  return agentChat(b.agent, messages, typeof b.doc === 'string' ? b.doc.slice(0, 500_000) : '', c.req.raw.signal, ERROR_MARK, PROGRESS_MARK, { model: b.model, effort: b.effort })
})
// Python trên máy để tính sẵn kịch bản (cũng chỉ cho phép từ chính máy này)
app.get('/api/python', async (c) => {
  if (!isLocal(c)) return c.json({ available: false, error: 'Local Python only works when Papercell is opened on the computer running the server.' })
  return c.json(await detectPython())
})
app.post('/api/python/grid', async (c) => {
  if (!isLocal(c)) return c.json({ error: 'Local Python can only be used from the computer running the server.' }, 403)
  const b = await c.req.json()
  if (typeof b.code !== 'string' || !Array.isArray(b.combos) || !Array.isArray(b.files)) return c.json({ error: 'Missing code, data or the list of combinations.' }, 400)
  return runGrid(b, c.req.raw.signal)
})
app.get('/api/ai/status', (c) => c.json({ serverKeys: serverKeys() }))
app.post('/api/ai/models', async (c) => {
  try { return c.json({ models: await listModels(readConfig(await c.req.json())) }) }
  catch (e) { return c.json({ error: 'Could not load the model list: ' + (e as Error).message }, 502) }
})

if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, () => console.log(`Papercell server: http://localhost:${port}`))
