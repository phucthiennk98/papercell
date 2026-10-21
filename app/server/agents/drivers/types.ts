// Contract shared by every local-agent driver (Claude Code, Codex, Antigravity).
// A driver keeps ONE long-lived CLI process for a chat session, so the agent keeps its own context
// between turns. The session manager (../session.ts) owns drivers; the browser never talks to a CLI directly.

export type AgentId = 'claude' | 'codex' | 'agy'

/** Options fixed for the lifetime of a session (changing model = new session). */
export type DriverOptions = {
  /** Model id from listModels(agent); undefined = the CLI's own default model. */
  model?: string
  /** Reasoning effort when the CLI supports it ('low' | 'medium' | 'high' | ...); undefined = CLI default. */
  effort?: string
  /** Working directory for the CLI. Contains document.md (the open document), rewritten before every turn. */
  cwd: string
}

/**
 * Events streamed to the browser while a turn runs (sent as NDJSON, one object per line).
 * A turn always ends with exactly one `done` or one `error`.
 */
export type AgentEvent =
  /** A piece of the assistant's answer text, in order. */
  | { type: 'text'; delta: string }
  /** What the agent is doing right now, short and human readable ("Reading document.md", "Thinking…"). */
  | { type: 'step'; text: string }
  /** A tool call the agent made (shown as a collapsed line in the chat). */
  | { type: 'tool'; name: string; detail?: string }
  /** The turn finished normally. `model` = the model that actually answered, when the CLI reports it. */
  | { type: 'done'; model?: string; usage?: { inputTokens?: number; outputTokens?: number } }
  /** The turn failed. `fatal` = the CLI process is gone and the session must be restarted. */
  | { type: 'error'; message: string; fatal?: boolean }

export interface AgentDriver {
  readonly agent: AgentId
  /** Start the CLI process and finish its handshake. Rejects with a readable Error if the CLI cannot start. */
  start(): Promise<void>
  /**
   * Run one user turn. `text` is the user's message (already including any instructions).
   * Emits events through `emit` and resolves when the turn ends (after emitting `done` or `error`).
   * Only one turn runs at a time; the session manager guarantees this.
   */
  send(text: string, emit: (e: AgentEvent) => void): Promise<void>
  /** Stop the running turn as soon as possible; the session stays usable afterwards. No-op when idle. */
  interrupt(): Promise<void>
  /** Kill the CLI process and its whole process tree (Windows: taskkill /T /F, see stopTree in ../local.ts). Idempotent. */
  close(): Promise<void>
  /** False once the CLI process has exited (crash, close, kill). */
  alive(): boolean
}

export type DriverFactory = (opts: DriverOptions) => AgentDriver

/** A model a CLI can use, as listed by the CLI itself. */
export type AgentModel = { id: string; label?: string; efforts?: string[]; isDefault?: boolean }
