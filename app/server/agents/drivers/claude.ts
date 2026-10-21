// Claude Code driver: one long-lived process per chat session.
// Protocol: claude -p --input-format stream-json --output-format stream-json --verbose --permission-mode plan [--model]
// STUB written by the coordinator; a worker replaces the body. Keep the exported name and signature.
import type { AgentDriver, DriverOptions } from './types'

export function createClaudeDriver(opts: DriverOptions): AgentDriver {
  void opts
  throw new Error('Claude Code driver is not implemented yet.')
}
