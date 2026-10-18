// Cấu hình nhà cung cấp AI, dùng chung cho giao diện và server.
export type ProviderId = 'anthropic' | 'openai' | 'google' | 'gateway' | 'compatible'

export type AIConfig = { provider: ProviderId; model: string; baseURL: string; apiKey: string }

export type ProviderInfo = {
  label: string
  defaultModel: string
  defaultBaseURL: string
  /** Biến môi trường server đọc khi người dùng không nhập key. */
  envVar: string
  keyUrl?: string
  keyOptional?: boolean
  note: string
  suggestions: string[]
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    label: 'Anthropic (Claude)', defaultModel: 'claude-opus-5-5', defaultBaseURL: 'https://api.anthropic.com/v1',
    envVar: 'ANTHROPIC_API_KEY', keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Calls the Anthropic API directly.',
    suggestions: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
  },
  openai: {
    label: 'OpenAI', defaultModel: 'gpt-4o-mini', defaultBaseURL: 'https://api.openai.com/v1',
    envVar: 'OPENAI_API_KEY', keyUrl: 'https://platform.openai.com/api-keys',
    note: 'Calls the OpenAI API directly.',
    suggestions: [],
  },
  google: {
    label: 'Google (Gemini)', defaultModel: 'gemini-2.5-flash', defaultBaseURL: 'https://generativelanguage.googleapis.com/v1beta',
    envVar: 'GOOGLE_GENERATIVE_AI_API_KEY', keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Calls Google Gemini directly.',
    suggestions: [],
  },
  gateway: {
    label: 'Vercel AI Gateway', defaultModel: 'anthropic/claude-opus-5-5', defaultBaseURL: 'https://ai-gateway.vercel.sh/v1/ai',
    envVar: 'AI_GATEWAY_API_KEY', keyUrl: 'https://vercel.com/ai-gateway',
    note: 'One key for many providers. Model names look like provider/model.',
    suggestions: ['anthropic/claude-opus-5-5', 'anthropic/claude-sonnet-5-5', 'openai/gpt-4o-mini', 'google/gemini-2.5-flash'],
  },
  compatible: {
    label: 'OpenAI-compatible server', defaultModel: '', defaultBaseURL: 'http://localhost:11434/v1',
    envVar: 'COMPATIBLE_API_KEY', keyOptional: true,
    note: 'Your own gateway or a local server: Ollama, LM Studio, vLLM, OpenRouter, LiteLLM…',
    suggestions: [],
  },
}

export const defaultConfig = (provider: ProviderId = 'anthropic'): AIConfig =>
  ({ provider, model: PROVIDERS[provider].defaultModel, baseURL: PROVIDERS[provider].defaultBaseURL, apiKey: '' })
