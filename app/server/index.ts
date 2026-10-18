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
app.post('/api/agents/chat', async (c) => {
  if (!isLocal(c)) return c.json({ error: 'Local agents can only be used from the computer running the server.' }, 403)
  const b = await c.req.json()
  const messages = (Array.isArray(b.messages) ? b.messages : []).filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  if (!messages.length) return c.json({ error: 'No question was sent.' }, 400)
  return agentChat(String(b.agent), messages, typeof b.doc === 'string' ? b.doc.slice(0, 500_000) : '', c.req.raw.signal, ERROR_MARK, PROGRESS_MARK)
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
