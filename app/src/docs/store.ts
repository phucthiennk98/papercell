// Store multiple documents in browser localStorage: one index key + one key per document.
import type { PapercellDoc } from '@/editor/types'
import { LEGACY_SAMPLE_TITLE, makeSample } from '@/sample'
import { GALLERY_TITLE, makeGallery } from '@/gallery'
import { upgradeDoc } from '@/editor/upgrade'

export type DocEntry = { id: string; title: string; updated: string }

const INDEX = 'papercell.index.v1'
const GALLERY = 'papercell.gallery.v1'
const KEY = (id: string) => `papercell.doc.${id}`

const read = <T,>(k: string): T | null => { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : null } catch { return null } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); return true } catch { return false } }

export const newDocId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export function listDocs(): DocEntry[] {
  return (read<DocEntry[]>(INDEX) ?? []).sort((a, b) => b.updated.localeCompare(a.updated))
}

export function loadDoc(id: string): PapercellDoc | null {
  const d = read<PapercellDoc>(KEY(id))
  return d?.version === 3 && Array.isArray(d.content) ? upgradeDoc(d) : null
}

export function saveDoc(id: string, doc: PapercellDoc, updated = new Date().toISOString()) {
  write(KEY(id), doc)
  const idx = (read<DocEntry[]>(INDEX) ?? []).filter((e) => e.id !== id)
  idx.push({ id, title: doc.meta.title || 'Untitled', updated })
  write(INDEX, idx)
}

export function deleteDoc(id: string) {
  try { localStorage.removeItem(KEY(id)) } catch { /* ignore */ }
  write(INDEX, (read<DocEntry[]>(INDEX) ?? []).filter((e) => e.id !== id))
}

export const emptyDoc = (): PapercellDoc => ({
  version: 3,
  meta: { title: '', authors: '', date: new Date().toISOString().slice(0, 10) },
  data: [],
  content: [{ type: 'p', children: [{ text: '' }] }],
})

/** On first open, seed the sample document and chart gallery (and upgrade legacy Vietnamese sample/gallery entries to English). */
export function ensureFirstDoc(): string {
  // Migrate any existing legacy Vietnamese sample or gallery documents in localStorage to English
  for (const entry of listDocs()) {
    if (entry.title === LEGACY_SAMPLE_TITLE) {
      saveDoc(entry.id, makeSample(), entry.updated)
    } else if (entry.title === 'Bộ thử biểu đồ') {
      saveDoc(entry.id, makeGallery(), entry.updated)
    }
  }
  if (!read<boolean>(GALLERY)) { saveDoc(newDocId(), makeGallery()); write(GALLERY, true) }
  const docs = listDocs()
  if (docs.length > 1 || docs.some((d) => d.title !== GALLERY_TITLE && d.title !== 'Bộ thử biểu đồ')) return docs[0].id
  const id = newDocId()
  saveDoc(id, makeSample())
  return id
}
