import { aiStore } from './store'

/** Replace saved editor routing options with the current Assistant selection. */
export function withAIRequestConfig(body: Record<string, unknown> = {}) {
  const {
    aiConfig: _config, aiMode: _mode, agent: _agent,
    agentModel: _agentModel, agentEffort: _agentEffort,
    apiKey: _key, model: _model, baseURL: _baseURL,
    ...context
  } = body
  const { mode, agent, config, agentSettings } = aiStore.get()
  const settings = mode === 'agent' ? agentSettings[agent] : undefined

  return {
    ...context,
    aiMode: mode,
    aiConfig: mode === 'agent' ? { ...config, apiKey: '' } : { ...config },
    agent: mode === 'agent' ? agent : '',
    agentModel: settings?.model || undefined,
    agentEffort: settings?.effort || undefined,
  }
}

/** Resolve routing at dispatch time, including requests from an already mounted editor. */
export const fetchWithAIConfig: typeof fetch = async (input, init) => {
  const body = withAIRequestConfig(JSON.parse(init?.body as string || '{}'))
  if (body.aiMode === 'agent' && !body.agent) {
    throw new Error('No local agent selected. Open the AI Assistant panel to set one up.')
  }
  return fetch(input, { ...init, body: JSON.stringify(body) })
}
