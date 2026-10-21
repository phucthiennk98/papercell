// Lists the models each local CLI can use, by asking the CLI itself (no inference turn is spent).
// STUB written by the coordinator; a worker replaces the body. Keep the exported names and signatures.
import type { AgentId, AgentModel } from './drivers/types'

/** Models for one CLI, cached ~5 minutes; `refresh` bypasses the cache. Never throws: returns [] plus a warning. */
export async function listAgentModels(agent: AgentId, refresh = false): Promise<{ models: AgentModel[]; warning?: string }> {
  void agent; void refresh
  return { models: [], warning: 'Model discovery is not implemented yet.' }
}
