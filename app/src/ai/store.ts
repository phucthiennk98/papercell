// Cài đặt AI phía trình duyệt. Cấu hình (không có key) luôn được nhớ;
// key chỉ giữ trong phiên này, trừ khi người dùng chọn "Nhớ key trên máy này".
import { useSyncExternalStore } from 'react'
import { defaultConfig, PROVIDERS, type AIConfig } from './config'

const CFG = 'papercell.ai.config'
const KEY = 'papercell.ai.key'
const REMEMBER = 'papercell.ai.remember'
const MODE = 'papercell.ai.mode'
const AGENT = 'papercell.ai.agent'
const AGENT_SETTINGS = 'papercell.ai.agent-settings'

/** 'api': gọi nhà cung cấp bằng key; 'agent': dùng agent đã cài trên máy (Claude Code, Codex, Antigravity…). */
export type AIMode = 'api' | 'agent'

const safe = <T,>(f: () => T, d: T): T => { try { return f() } catch { return d } }

export type AgentSettings = { model?: string; effort?: string }
type State = { config: AIConfig; remember: boolean; mode: AIMode; agent: string; agentSettings: Record<string, AgentSettings> }

function load(): State {
  const remember = safe(() => localStorage.getItem(REMEMBER) === '1', false)
  const saved = safe(() => JSON.parse(localStorage.getItem(CFG) ?? 'null') as Partial<AIConfig> | null, null)
  const base = saved?.provider && saved.provider in PROVIDERS ? { ...defaultConfig(saved.provider), ...saved } : defaultConfig()
  const apiKey = safe(() => (remember ? localStorage : sessionStorage).getItem(KEY) ?? '', '')
  const mode = safe(() => (localStorage.getItem(MODE) === 'agent' ? 'agent' : 'api'), 'api' as AIMode)
  const agent = safe(() => localStorage.getItem(AGENT) ?? '', '')
  const agentSettings = safe(() => {
    const saved = JSON.parse(localStorage.getItem(AGENT_SETTINGS) ?? '{}')
    const result: Record<string, AgentSettings> = {}
    for (const id of ['claude', 'codex', 'agy']) {
      const value = saved?.[id]
      if (value && typeof value === 'object') result[id] = {
        model: typeof value.model === 'string' && value.model ? value.model : undefined,
        effort: typeof value.effort === 'string' && value.effort ? value.effort : undefined,
      }
    }
    return result
  }, {})
  return { config: { ...base, apiKey }, remember, mode, agent, agentSettings }
}

let state = load()
const subs = new Set<() => void>()

function persist() {
  const { apiKey, ...rest } = state.config
  safe(() => {
    localStorage.setItem(CFG, JSON.stringify(rest))
    localStorage.setItem(REMEMBER, state.remember ? '1' : '0')
    localStorage.setItem(MODE, state.mode)
    localStorage.setItem(AGENT, state.agent)
    localStorage.setItem(AGENT_SETTINGS, JSON.stringify(state.agentSettings))
    if (state.remember) { localStorage.setItem(KEY, apiKey); sessionStorage.removeItem(KEY) }
    else { sessionStorage.setItem(KEY, apiKey); localStorage.removeItem(KEY) }
  }, undefined)
}

export const aiStore = {
  get: () => state,
  set(patch: Partial<AIConfig>, remember?: boolean) {
    state = { ...state, config: { ...state.config, ...patch }, remember: remember ?? state.remember }
    persist(); subs.forEach((f) => f())
  },
  setMode(mode: AIMode, agent?: string) {
    state = { ...state, mode, agent: agent ?? state.agent }
    persist(); subs.forEach((f) => f())
  },
  setAgentSettings(agent: string, patch: Partial<AgentSettings>) {
    state = { ...state, agentSettings: { ...state.agentSettings, [agent]: { ...state.agentSettings[agent], ...patch } } }
    persist(); subs.forEach((f) => f())
  },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f) } },
}

export const useAI = () => useSyncExternalStore(aiStore.subscribe, aiStore.get)
