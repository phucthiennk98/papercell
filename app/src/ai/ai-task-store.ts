import { useSyncExternalStore } from 'react'

export type AITaskStatus = 'idle' | 'running' | 'review' | 'error'
export type AITaskKind = 'insert' | 'edit' | 'generate'

export type AITaskState = {
  status: AITaskStatus
  menuTargetId: string | null
  blockIds: string[]
  originalBlocks: any[]
  createdPlaceholder: boolean
  originalText: string
  promptLabel: string
  promptSent: string
  toolName: 'edit' | 'generate' | 'comment'
  taskKind: AITaskKind
  startedAt: number
  content: string
  hasFigures: boolean
  error?: string
}

const INITIAL: AITaskState = {
  status: 'idle',
  menuTargetId: null,
  blockIds: [],
  originalBlocks: [],
  createdPlaceholder: false,
  originalText: '',
  promptLabel: '',
  promptSent: '',
  toolName: 'generate',
  taskKind: 'insert',
  startedAt: 0,
  content: '',
  hasFigures: false,
}

let state: AITaskState = { ...INITIAL }
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((fn) => fn())
}

export const aiTaskStore = {
  get: () => state,
  set(patch: Partial<AITaskState>) {
    state = { ...state, ...patch }
    emit()
  },
  reset() {
    state = { ...INITIAL }
    emit()
  },
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}

export const useAITask = () =>
  useSyncExternalStore(aiTaskStore.subscribe, aiTaskStore.get)
