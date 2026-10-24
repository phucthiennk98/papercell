import { newId } from '@/editor/types';

export interface AIAttachment {
  id: string;
  name: string;
  kind: 'image' | 'file';
  mimeType: string;
  size: number;
  /** Data URL for images (e.g. data:image/png;base64,...) */
  dataUrl?: string;
  /** Extracted UTF-8 text content for reference files (.csv, .md, .txt, .json, .py, .xlsx, etc.) */
  textContent?: string;
}

export interface ChatHistoryMsg {
  role: 'user' | 'assistant';
  content: string;
  attachments?: AIAttachment[];
  error?: boolean;
  progress?: string;
  by?: string;
  startedAt?: number;
  ms?: number;
  steps?: { name: string; detail?: string }[];
  notice?: string;
  failure?: string;
}

export interface DocChatThread {
  id: string;
  docId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatHistoryMsg[];
}

const STORAGE_PREFIX = 'papercell.ai.history.v1.';
const MAX_THREADS_PER_DOC = 25;
const MAX_TEXT_ATTACHMENT_CHARS = 40_000;

function storageKey(docId: string): string {
  return `${STORAGE_PREFIX}${docId || 'default'}`;
}

export function deriveThreadTitle(messages: ChatHistoryMsg[]): string {
  const firstUser = messages.find(
    (m) =>
      m.role === 'user' &&
      (m.content.trim().length > 0 || (m.attachments?.length ?? 0) > 0)
  );
  if (!firstUser) return 'New conversation';
  const clean = firstUser.content.replace(/\s+/g, ' ').trim();
  if (clean) {
    return clean.length > 52 ? `${clean.slice(0, 51)}…` : clean;
  }
  const firstAtt = firstUser.attachments?.[0];
  return firstAtt ? `Attachment: ${firstAtt.name}` : 'New conversation';
}

export function createEmptyThread(docId: string): DocChatThread {
  const now = Date.now();
  return {
    id: `chat-${newId()}`,
    docId,
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export function loadDocThreads(docId: string): DocChatThread[] {
  try {
    const raw = localStorage.getItem(storageKey(docId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (t: any) =>
          t &&
          typeof t.id === 'string' &&
          Array.isArray(t.messages) &&
          t.messages.length > 0
      )
      .sort((a: DocChatThread, b: DocChatThread) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function writeDocThreads(docId: string, threads: DocChatThread[]): void {
  const trimmed = threads
    .filter((t) => t.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_THREADS_PER_DOC);
  try {
    localStorage.setItem(storageKey(docId), JSON.stringify(trimmed));
  } catch {
    // If localStorage quota is tight due to base64 images, strip large dataUrls on older threads and retry
    try {
      const compact = trimmed.map((t, idx) => ({
        ...t,
        messages: t.messages.map((m) => ({
          ...m,
          attachments: m.attachments?.map((a) =>
            idx > 2 && a.dataUrl && a.dataUrl.length > 30_000
              ? { ...a, dataUrl: undefined }
              : a
          ),
        })),
      }));
      localStorage.setItem(storageKey(docId), JSON.stringify(compact));
    } catch {
      // Ignore storage errors
    }
  }
}

export function saveDocThread(
  docId: string,
  thread: DocChatThread
): DocChatThread[] {
  const existing = loadDocThreads(docId).filter((t) => t.id !== thread.id);
  if (thread.messages.length === 0) {
    writeDocThreads(docId, existing);
    return existing;
  }
  const updated: DocChatThread = {
    ...thread,
    docId,
    title: deriveThreadTitle(thread.messages),
    updatedAt: Date.now(),
  };
  const next = [updated, ...existing].slice(0, MAX_THREADS_PER_DOC);
  writeDocThreads(docId, next);
  return next;
}

export function deleteDocThread(
  docId: string,
  threadId: string
): DocChatThread[] {
  const next = loadDocThreads(docId).filter((t) => t.id !== threadId);
  writeDocThreads(docId, next);
  return next;
}

/** Downscale large pasted/uploaded images so they transfer quickly to AI and fit in history. */
async function fileToImageDataUrl(file: File): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });

  if (typeof document === 'undefined' || rawDataUrl.length < 180_000) {
    return rawDataUrl;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1280;
      const scale = Math.min(
        1,
        maxDim / Math.max(img.width || 1, img.height || 1)
      );
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

async function extractReferenceFileText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    try {
      const { default: readXlsxFile } = await import('read-excel-file/browser');
      const sheets = await readXlsxFile(file);
      const rows = (sheets[0]?.data ?? []) as unknown[][];
      const csvLines = rows
        .slice(0, 200)
        .map((r: unknown[]) =>
          r
            .map((cell: unknown) =>
              cell === null || cell === undefined ? '' : String(cell)
            )
            .join('\t')
        );
      return csvLines.join('\n').slice(0, MAX_TEXT_ATTACHMENT_CHARS);
    } catch {
      return `(Spreadsheet file: ${file.name})`;
    }
  }
  const text = await file.text();
  return text.slice(0, MAX_TEXT_ATTACHMENT_CHARS);
}

export async function fileToAIAttachment(
  file: File,
  fallbackName?: string
): Promise<AIAttachment> {
  const name = file.name || fallbackName || 'attachment';
  const mimeType = file.type || 'application/octet-stream';
  if (
    mimeType.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name)
  ) {
    const dataUrl = await fileToImageDataUrl(file);
    return {
      id: `att-${newId()}`,
      name,
      kind: 'image',
      mimeType: mimeType.startsWith('image/') ? mimeType : 'image/png',
      size: file.size,
      dataUrl,
    };
  }

  const textContent = await extractReferenceFileText(file);
  return {
    id: `att-${newId()}`,
    name,
    kind: 'file',
    mimeType,
    size: file.size,
    textContent,
  };
}

export async function readClipboardAttachments(
  clipboardData: DataTransfer | null
): Promise<AIAttachment[]> {
  if (!clipboardData) return [];
  const files: File[] = [];

  if (clipboardData.items && clipboardData.items.length > 0) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
  } else if (clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      files.push(clipboardData.files[i]);
    }
  }

  const out: AIAttachment[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = f.type.split('/')[1] || 'png';
    const defaultName =
      !f.name || f.name === 'image.png'
        ? `pasted-${Date.now()}-${i + 1}.${ext}`
        : f.name;
    const namedFile =
      f.name === defaultName
        ? f
        : new File([f], defaultName, { type: f.type });
    out.push(await fileToAIAttachment(namedFile, defaultName));
  }
  return out;
}

export async function readFileListAttachments(
  fileList: FileList | File[] | null
): Promise<AIAttachment[]> {
  if (!fileList) return [];
  const arr = Array.from(fileList);
  const out: AIAttachment[] = [];
  for (const f of arr) {
    out.push(await fileToAIAttachment(f));
  }
  return out;
}

/**
 * Formats attached reference files and image descriptions into a prompt block
 * so both cloud models and local CLI agents have full context of the attachments.
 */
export function buildPromptWithAttachments(
  userText: string,
  attachments: AIAttachment[],
  options: { embedImageTag?: boolean } = {}
): string {
  if (!attachments.length) return userText;
  const blocks: string[] = [];

  for (const att of attachments) {
    if (att.kind === 'file' && att.textContent) {
      blocks.push(
        `<reference_file name="${att.name}">\n${att.textContent}\n</reference_file>`
      );
    } else if (att.kind === 'image') {
      if (options.embedImageTag && att.dataUrl) {
        blocks.push(
          `<attached_image name="${att.name}" data_url="${att.dataUrl}" />`
        );
      } else {
        blocks.push(
          `[Attached reference image: ${att.name} — analyze the visual content, layout, chart, or formula shown in this image]`
        );
      }
    }
  }

  return `${blocks.join('\n\n')}${userText.trim() ? `\n\n${userText.trim()}` : '\n\nAnalyze the attached reference(s) and fulfill the request.'}`;
}
