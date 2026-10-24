// Create a Vercel AI SDK model instance from user-supplied configuration.
// Falls back to server environment variables when no client API key is provided.
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createGateway, type LanguageModel } from 'ai'
import { PROVIDERS, type AIConfig, type ProviderId } from '../../src/ai/config'

export class ConfigError extends Error {}

const isProvider = (p: unknown): p is ProviderId => typeof p === 'string' && p in PROVIDERS

/** Parse AI configuration from request body; also supports legacy Plate format (apiKey + model). */
export function readConfig(body: { aiConfig?: Partial<AIConfig>; apiKey?: unknown; model?: unknown }): AIConfig {
  const c = body.aiConfig
  if (c && isProvider(c.provider)) {
    const info = PROVIDERS[c.provider]
    return { provider: c.provider, model: (c.model || info.defaultModel).trim(), baseURL: (c.baseURL || info.defaultBaseURL).trim(), apiKey: (c.apiKey ?? '').trim() }
  }
  return { provider: 'gateway', model: typeof body.model === 'string' && body.model ? body.model : PROVIDERS.gateway.defaultModel, baseURL: PROVIDERS.gateway.defaultBaseURL, apiKey: typeof body.apiKey === 'string' ? body.apiKey.trim() : '' }
}

export const keyFor = (cfg: AIConfig) => cfg.apiKey || process.env[PROVIDERS[cfg.provider].envVar] || ''

export function resolveModel(cfg: AIConfig): LanguageModel {
  const info = PROVIDERS[cfg.provider]
  const apiKey = keyFor(cfg)
  if (!apiKey && !info.keyOptional) throw new ConfigError(`No API key for ${info.label}. Enter one in the AI Assistant or set ${info.envVar} on the server.`)
  if (!cfg.model) throw new ConfigError('No model selected.')
  switch (cfg.provider) {
    case 'anthropic': return createAnthropic({ apiKey, baseURL: cfg.baseURL })(cfg.model)
    case 'openai': return createOpenAI({ apiKey, baseURL: cfg.baseURL })(cfg.model)
    case 'google': return createGoogleGenerativeAI({ apiKey, baseURL: cfg.baseURL })(cfg.model)
    case 'gateway': return createGateway({ apiKey, baseURL: cfg.baseURL })(cfg.model)
    case 'compatible': return createOpenAICompatible({ name: 'compatible', apiKey: apiKey || undefined, baseURL: cfg.baseURL })(cfg.model)
  }
}

/** Fetch available models reported by the provider (used by the refresh button). */
export async function listModels(cfg: AIConfig): Promise<string[]> {
  const apiKey = keyFor(cfg)
  const base = cfg.baseURL.replace(/\/+$/, '')
  let url = `${base}/models`, headers: Record<string, string> = {}
  if (cfg.provider === 'anthropic') headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  else if (cfg.provider === 'google') url = `${base}/models?key=${encodeURIComponent(apiKey)}`
  else if (cfg.provider === 'gateway') url = 'https://ai-gateway.vercel.sh/v1/models'
  else if (apiKey) headers = { authorization: `Bearer ${apiKey}` }
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const j = (await res.json()) as { data?: { id: string }[]; models?: { name: string }[] }
  const ids = j.data?.map((m) => m.id) ?? j.models?.map((m) => m.name.replace(/^models\//, '')) ?? []
  return ids.sort()
}

/** List which providers have server-side API keys configured (never exposes the keys themselves). */
export const serverKeys = () => Object.fromEntries((Object.keys(PROVIDERS) as ProviderId[]).map((p) => [p, !!process.env[PROVIDERS[p].envVar]]))
