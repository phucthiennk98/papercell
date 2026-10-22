// Lists the models each local CLI can use, by asking the CLI itself (no inference turn is spent).
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolveBin, stopTree } from './local'
import type { AgentId, AgentModel } from './drivers/types'

type Catalog = { models: AgentModel[]; warning?: string }
const cache = new Map<AgentId, { at: number; value: Catalog }>()
const pending = new Map<AgentId, Promise<Catalog>>()

function discover(agent: AgentId): Promise<Catalog> {
  const bin = resolveBin(agent)
  if (!bin) return Promise.resolve({ models: [], warning: `${agent} was not found on this computer.` })
  const args = agent === 'agy' ? ['models'] : agent === 'codex' ? ['app-server', '--stdio']
    : ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'plan']
  return new Promise((resolve) => {
    const child = spawn(bin.shell ? `"${bin.file}"` : bin.file, args, {
      shell: bin.shell, windowsHide: true, env: { ...process.env, NO_COLOR: '1' },
    })
    let settled = false, bytes = 0, requestId = 1
    const models: AgentModel[] = []
    const cursors = new Set<string>()
    const finish = (warning?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      stopTree(child)
      lines.close()
      resolve(warning ? { models: [], warning } : { models: [...new Map(models.map((m) => [m.id, m])).values()] })
    }
    const timer = setTimeout(() => finish(`${agent} model discovery timed out after 15 seconds.`), 15_000)
    const write = (message: unknown) => child.stdin.write(JSON.stringify(message) + '\n')
    const list = (cursor?: string) => write({ id: ++requestId, method: 'model/list', params: { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) } })
    const lines = createInterface({ input: child.stdout })
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > 4 * 1024 * 1024) finish(`${agent} model catalog exceeded the size limit.`)
    })
    child.stderr.resume()
    child.stdin.on('error', () => finish(`${agent} closed its model discovery channel.`))
    child.on('error', () => finish(`${agent} could not start. Check its installation and PATH.`))
    child.on('close', (code) => {
      if (agent === 'agy' && code === 0 && models.length) finish()
      else finish(`${agent} model discovery closed without a catalog. Check the CLI login and configuration.`)
    })
    lines.on('line', (line) => {
      if (settled) return
      if (agent === 'agy') {
        const tab = line.indexOf('\t')
        if (tab > 0 && !/^Fetching/i.test(line.trim())) {
          const id = line.slice(0, tab).trim(), label = line.slice(tab + 1).trim()
          if (id) models.push({ id, label: label || undefined })
        }
        return
      }
      let message
      try { message = JSON.parse(line) } catch { return }
      if (!message || typeof message !== 'object') return
      if (agent === 'claude') {
        if (message.type !== 'control_response' || message.response?.request_id !== 'models') return
        const response = message.response
        if (response.subtype !== 'success') return finish('Claude model initialization failed. Check the CLI login and configuration.')
        const rows = response.response?.models
        if (!Array.isArray(rows)) return finish('Claude returned an invalid model catalog.')
        for (const model of rows) {
          if (!model || typeof model !== 'object') continue
          const id = model.resolvedModel || model.value
          if (model.value !== 'default' && typeof id === 'string' && id) models.push({ id, label: model.displayName })
        }
        finish(models.length ? undefined : 'Claude returned no models.')
      } else if (message.id === requestId) {
        if (message.error) return finish('Codex model discovery failed. Check the CLI login and configuration.')
        if (requestId === 1) {
          write({ method: 'initialized', params: {} })
          list()
          return
        }
        const rows = message.result?.data
        if (!Array.isArray(rows)) return finish('Codex returned an invalid model catalog.')
        for (const model of rows) {
          if (!model || typeof model !== 'object') continue
          const id = model.model || model.id
          if (model.hidden || typeof id !== 'string' || !id) continue
          const efforts = (Array.isArray(model.supportedReasoningEfforts) ? model.supportedReasoningEfforts : []).map((e: { reasoningEffort?: string } | null) => e?.reasoningEffort).filter((e: unknown): e is string => typeof e === 'string')
          models.push({ id, label: model.displayName, efforts: efforts.length ? efforts : undefined, isDefault: model.isDefault })
        }
        const cursor = message.result?.nextCursor
        if (!cursor) return finish(models.length ? undefined : 'Codex returned no models.')
        if (typeof cursor !== 'string' || cursors.has(cursor) || cursors.size >= 100) return finish('Codex returned an invalid model catalog cursor.')
        cursors.add(cursor)
        list(cursor)
      }
    })
    if (agent === 'codex') write({ id: 1, method: 'initialize', params: { clientInfo: { name: 'papercell', version: '1.0.0' } } })
    else if (agent === 'claude') write({ type: 'control_request', request_id: 'models', request: { subtype: 'initialize', hooks: {}, sdkMcpServers: [] } })
    else child.stdin.end()
  })
}

/** Models for one CLI, cached ~5 minutes; `refresh` bypasses the cache. Never throws: returns [] plus a warning. */
export async function listAgentModels(agent: AgentId, refresh = false): Promise<{ models: AgentModel[]; warning?: string }> {
  const cached = cache.get(agent)
  if (!refresh && cached && Date.now() - cached.at < 300_000) return cached.value
  const running = pending.get(agent)
  if (running) return running
  const task = Promise.resolve().then(() => discover(agent)).catch(() => ({ models: [], warning: `${agent} model discovery failed. Check the CLI installation and configuration.` }))
  pending.set(agent, task)
  try {
    const value = await task
    cache.set(agent, { at: Date.now(), value })
    return value
  } finally { pending.delete(agent) }
}
