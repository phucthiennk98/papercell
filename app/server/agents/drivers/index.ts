// Registry of local-agent drivers. Add a CLI here after writing its driver.
import type { AgentId, DriverFactory } from './types'
import { createAgyDriver } from './agy'
import { createClaudeDriver } from './claude'
import { createCodexDriver } from './codex'

export const DRIVERS: Record<AgentId, DriverFactory> = {
  claude: createClaudeDriver,
  codex: createCodexDriver,
  agy: createAgyDriver,
}

export const isAgentId = (v: unknown): v is AgentId => v === 'claude' || v === 'codex' || v === 'agy'
