import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { callCompletionApi } from '@platejs/ai/react'
import { askAI } from './ask'
import { fetchWithAIConfig, withAIRequestConfig } from './request-config'
import { aiStore } from './store'

const initial = aiStore.get()
const originalFetch = globalThis.fetch
after(() => {
  globalThis.fetch = originalFetch
  aiStore.set(initial.config, initial.remember)
  aiStore.setMode(initial.mode, initial.agent)
  for (const agent of ['claude', 'codex', 'agy']) {
    aiStore.setAgentSettings(agent, { model: undefined, effort: undefined, ...initial.agentSettings[agent] })
  }
})

test('editor requests follow current selection despite stale options from another document', async () => {
  const requests: { url: string; body: Record<string, any>; signal: AbortSignal | null | undefined }[] = []
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(init!.body as string), signal: init?.signal })
    return Response.json({ text: 'Continued.' })
  }
  const signal = new AbortController().signal
  const context = { children: [{ type: 'p', children: [{ text: 'Article context' }] }] }
  const messages = [{ role: 'user', parts: [{ type: 'text', text: 'Improve this' }] }]
  const stale = {
    aiMode: 'api', aiConfig: { apiKey: 'stale-secret' }, apiKey: 'legacy-secret',
    model: 'legacy-model', baseURL: 'https://legacy.invalid', agent: 'claude',
    agentModel: 'stale-model', agentEffort: 'stale-effort',
    ctx: context, messages, instructions: 'Continue naturally.', prompt: 'Some text', system: 'Writing assistant',
  }
  aiStore.set({ provider: 'openai', model: 'api-model', apiKey: 'current-secret', baseURL: 'https://api.invalid/v1' })
  aiStore.setMode('agent', 'codex')
  aiStore.setAgentSettings('codex', { model: 'codex-model', effort: 'high' })

  for (const url of ['/api/ai/command', '/api/ai/copilot']) {
    await fetchWithAIConfig(url, { method: 'POST', signal, body: JSON.stringify(stale) })
    const request = requests.at(-1)!
    assert.equal(request.url, url)
    assert.equal(request.signal, signal)
    assert.equal(request.body.aiMode, 'agent')
    assert.equal(request.body.agent, 'codex')
    assert.equal(request.body.agentModel, 'codex-model')
    assert.equal(request.body.agentEffort, 'high')
    assert.equal(request.body.aiConfig.apiKey, '')
    assert.equal(JSON.stringify(request.body).includes('secret'), false)
    assert.equal(request.body.model, undefined)
    assert.equal(request.body.baseURL, undefined)
    assert.deepEqual(request.body.ctx, context)
    assert.deepEqual(request.body.messages, messages)
    assert.equal(request.body.instructions, stale.instructions)
    assert.equal(request.body.prompt, stale.prompt)
    assert.equal(request.body.system, stale.system)
  }

  const savedBody = withAIRequestConfig(stale)
  aiStore.setAgentSettings('codex', { model: 'updated-model', effort: 'low' })
  await fetchWithAIConfig('/api/ai/command', { body: JSON.stringify(savedBody) })
  assert.equal(requests.at(-1)!.body.agentModel, 'updated-model')
  assert.equal(requests.at(-1)!.body.agentEffort, 'low')

  aiStore.setAgentSettings('claude', { model: 'claude-model', effort: undefined })
  aiStore.setMode('agent', 'claude')
  await fetchWithAIConfig('/api/ai/copilot', { body: JSON.stringify(savedBody) })
  assert.equal(requests.at(-1)!.body.agent, 'claude')
  assert.equal(requests.at(-1)!.body.agentModel, 'claude-model')
  assert.equal('agentEffort' in requests.at(-1)!.body, false)

  aiStore.setMode('api')
  await fetchWithAIConfig('/api/ai/command', { body: JSON.stringify(savedBody) })
  const apiBody = requests.at(-1)!.body
  assert.equal(apiBody.aiMode, 'api')
  assert.equal(apiBody.agent, '')
  assert.equal('agentModel' in apiBody, false)
  assert.equal('agentEffort' in apiBody, false)
  assert.equal(apiBody.aiConfig.apiKey, 'current-secret')
  assert.equal(apiBody.aiConfig.model, 'api-model')

  aiStore.setMode('agent', 'codex')
  aiStore.setAgentSettings('codex', { model: undefined, effort: undefined })
  await fetchWithAIConfig('/api/ai/command', { body: JSON.stringify(apiBody) })
  assert.equal(requests.at(-1)!.body.aiMode, 'agent')
  assert.equal(requests.at(-1)!.body.agent, 'codex')
  assert.equal('agentModel' in requests.at(-1)!.body, false)
  assert.equal('agentEffort' in requests.at(-1)!.body, false)
  assert.equal(requests.at(-1)!.body.aiConfig.apiKey, '')
})

test('Copilot completion API preserves instructions while resolving routing at dispatch', async () => {
  let body: Record<string, any> = {}
  globalThis.fetch = async (_, init) => {
    body = JSON.parse(init!.body as string)
    return Response.json({ text: 'Continued.' })
  }
  aiStore.setMode('api')
  const savedBody = withAIRequestConfig({ instructions: 'Keep punctuation.' })
  aiStore.setMode('agent', 'agy')
  aiStore.setAgentSettings('agy', { model: 'selected-model', effort: 'medium' })
  const text = await callCompletionApi({
    api: '/api/ai/copilot', prompt: 'Article text', body: savedBody, fetch: fetchWithAIConfig,
  })
  assert.equal(text, 'Continued.')
  assert.equal(body.prompt, 'Article text')
  assert.equal(body.instructions, 'Keep punctuation.')
  assert.equal(body.aiMode, 'agent')
  assert.equal(body.agent, 'agy')
  assert.equal(body.agentModel, 'selected-model')
  assert.equal(body.agentEffort, 'medium')
})

test('missing local agent fails before fetching without falling back to API', async () => {
  let fetched = false
  globalThis.fetch = async () => { fetched = true; return Response.json({}) }
  aiStore.setMode('agent', '')
  await assert.rejects(fetchWithAIConfig('/api/ai/command', { body: '{}' }), /No local agent selected/)
  assert.equal(fetched, false)
})

test('empty one-shot responses describe settings for the selected mode', async () => {
  globalThis.fetch = async () => new Response('')
  const options = { messages: [], doc: '', signal: new AbortController().signal }
  aiStore.setMode('agent', 'codex')
  await assert.rejects(askAI(options), /Check the Local agent selection and model/)
  aiStore.setMode('api')
  await assert.rejects(askAI(options), /Check the model and API key/)
})
