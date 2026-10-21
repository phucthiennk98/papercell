// Codex driver: one long-lived process per chat session.
// Protocol: codex app-server (JSON-RPC over stdio), read-only sandbox, approval never
// STUB written by the coordinator; a worker replaces the body. Keep the exported name and signature.
import type { AgentDriver, DriverOptions } from './types'

export function createCodexDriver(opts: DriverOptions): AgentDriver {
  void opts
  throw new Error('Codex driver is not implemented yet.')
}
