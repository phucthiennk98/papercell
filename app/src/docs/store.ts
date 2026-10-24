// Store multiple documents in browser localStorage: one index key + one key per document.
import { newId, type PapercellDoc } from '@/editor/types'
import { LEGACY_SAMPLE_TITLE, LEGACY_SAMPLE_TITLE_EN, LEGACY_SAMPLE_TITLE_LONG, makeSample } from '@/sample'
import { GALLERY_TITLE, makeGallery } from '@/gallery'
import { upgradeDoc } from '@/editor/upgrade'

export type DocEntry = { id: string; title: string; updated: string; pinned?: boolean }

const INDEX = 'papercell.index.v1'
const GALLERY = 'papercell.gallery.v3'
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

export function saveDoc(id: string, doc: PapercellDoc, updated = new Date().toISOString(), pinned?: boolean) {
  write(KEY(id), doc)
  const all = read<DocEntry[]>(INDEX) ?? []
  const prev = all.find((e) => e.id === id)
  const idx = all.filter((e) => e.id !== id)
  idx.push({ id, title: doc.meta.title || 'Untitled', updated, pinned: pinned ?? prev?.pinned })
  write(INDEX, idx)
}

export function togglePinDoc(id: string): boolean {
  const all = read<DocEntry[]>(INDEX) ?? []
  let nextPinned = false
  const idx = all.map((e) => {
    if (e.id !== id) return e
    nextPinned = !e.pinned
    return { ...e, pinned: nextPinned }
  })
  write(INDEX, idx)
  return nextPinned
}

export function deleteDoc(id: string) {
  try { localStorage.removeItem(KEY(id)) } catch { /* ignore */ }
  write(INDEX, (read<DocEntry[]>(INDEX) ?? []).filter((e) => e.id !== id))
}

export const emptyDoc = (): PapercellDoc => ({
  version: 3,
  meta: { title: '', authors: '', date: new Date().toISOString().slice(0, 10) },
  data: [],
  content: [{ type: 'p', id: newId(), children: [{ text: '' }] }],
})

/** On first open, seed the sample document and chart gallery (and upgrade legacy Vietnamese sample/gallery entries to English). */
export function ensureFirstDoc(): string {
  // Migrate any existing legacy Vietnamese sample or gallery documents in localStorage to English
  for (const entry of listDocs()) {
    if (entry.title === LEGACY_SAMPLE_TITLE || entry.title === LEGACY_SAMPLE_TITLE_EN || entry.title === LEGACY_SAMPLE_TITLE_LONG) {
      saveDoc(entry.id, makeSample(), entry.updated)
    } else if (entry.title === 'Bộ thử biểu đồ') {
      saveDoc(entry.id, makeGallery(), entry.updated)
    }
  }
  if (!read<boolean>(GALLERY)) {
    const existingGallery = listDocs().find((d) => d.title === GALLERY_TITLE)
    if (existingGallery) saveDoc(existingGallery.id, makeGallery(), existingGallery.updated, existingGallery.pinned)
    else saveDoc(newDocId(), makeGallery())
    write(GALLERY, true)
  }
  const docs = listDocs()
  if (docs.length > 1 || docs.some((d) => d.title !== GALLERY_TITLE && d.title !== 'Bộ thử biểu đồ')) return docs[0].id
  const id = newDocId()
  saveDoc(id, makeSample())
  return id
}
