// Antigravity driver: one long-lived process per chat session.
// Protocol: agy -p --input-format stream-json --output-format stream-json --mode plan [--model] [--effort]
// STUB written by the coordinator; a worker replaces the body. Keep the exported name and signature.
import type { AgentDriver, DriverOptions } from './types'

export function createAgyDriver(opts: DriverOptions): AgentDriver {
  void opts
  throw new Error('Antigravity driver is not implemented yet.')
}
