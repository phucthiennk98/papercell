// Server Papercell: route AI của Plate, (sau này) MCP, và phát giao diện đã build.
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { POST as aiCommand } from './ai/command/route'
import { POST as aiCopilot } from './ai/copilot/route'

const app = new Hono()

app.get('/api/health', (c) => c.json({ ok: true }))
app.post('/api/ai/command', (c) => aiCommand(c.req.raw))
app.post('/api/ai/copilot', (c) => aiCopilot(c.req.raw))

if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('*', serveStatic({ path: './dist/index.html' }))
}

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, () => console.log(`Papercell server: http://localhost:${port}`))
