import type { ChatMessage, ToolName } from '@/components/editor/use-chat';
import type { SlateEditor } from 'platejs';

import { getMarkdown } from '@platejs/ai';
import { deserializeMd, serializeMd } from '@platejs/markdown';
import { getTableGridAbove } from '@platejs/table';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { NodeApi, nanoid } from 'platejs';
import { z } from 'zod';

import { agentChat } from '../agents/local';
import { ERROR_MARK, PROGRESS_MARK } from './assistant';
import {
  getChooseToolPrompt,
  getCommentPrompt,
  getEditPrompt,
  getGeneratePrompt,
} from './command/prompt';

export type EditorAgentRunner = typeof agentChat;
type AgentRequest = { agent?: unknown; agentModel?: unknown; agentEffort?: unknown };

export class EditorAgentError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export function editorAgentError(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') {
    return Response.json(null, { status: 408 });
  }
  return Response.json(
    { error: error instanceof Error ? error.message : 'Local agent request failed.' },
    { status: error instanceof EditorAgentError ? error.status : 502 }
  );
}

const validOption = (value: unknown): value is string | undefined =>
  value === undefined || (typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(value));

export const isLocalAgentAddress = (address: string | undefined, allowRemote = process.env.PAPERCELL_ALLOW_REMOTE_AGENTS) =>
  allowRemote === '1' || address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';

// Authorization defaults to denied; only the Hono wrapper can authorize host access.
export function prepareEditorAgent(
  body: AgentRequest,
  allowLocalAgent: boolean,
  signal: AbortSignal,
  runner: EditorAgentRunner = agentChat
) {
  if (!allowLocalAgent) throw new EditorAgentError('Local agents can only be used from the computer running the server.', 403);
  if (body.agent !== 'claude' && body.agent !== 'codex' && body.agent !== 'agy') {
    throw new EditorAgentError('Choose a valid local agent.', 400);
  }
  if (!validOption(body.agentModel) || !validOption(body.agentEffort)) {
    throw new EditorAgentError('Invalid model or reasoning effort.', 400);
  }
  const agent = body.agent;
  const options = { model: body.agentModel, effort: body.agentEffort };

  return async (prompt: string, doc = '') => {
    signal.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let rejectAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(new DOMException('AI request was cancelled.', 'AbortError'));
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
    });
    try {
      const response = await Promise.race([
        runner(agent, [{ role: 'user', content: prompt }], doc.slice(0, 500_000), controller.signal, ERROR_MARK, PROGRESS_MARK, options),
        aborted,
      ]);
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new EditorAgentError(error?.error || `Local agent failed (${response.status}).`, response.status);
      }
      if (!response.body) throw new EditorAgentError('The local agent returned no response.');
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let raw = '';
      while (true) {
        const { done, value } = await Promise.race([reader.read(), aborted]);
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        if (raw.length > 1_000_000) throw new EditorAgentError('The local agent response is too large.');
      }
      raw += decoder.decode();
      signal.throwIfAborted();
      const errorAt = raw.indexOf(ERROR_MARK);
      if (errorAt !== -1) throw new EditorAgentError(raw.slice(errorAt + ERROR_MARK.length).split(PROGRESS_MARK)[0].trim() || 'The local agent failed.');
      // Markers may span chunks. Buffer before emitting any document modifications.
      const text = raw.split(PROGRESS_MARK).map((part, index) =>
        index === 0 ? part : part.includes('\n') ? part.slice(part.indexOf('\n') + 1) : ''
      ).join('').trimEnd();
      if (!text.trim()) throw new EditorAgentError('The local agent returned no answer.');
      return text;
    } finally {
      signal.removeEventListener('abort', abort);
      if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
      controller.abort();
      void reader?.cancel().catch(() => {});
    }
  };
}

function parseJSON(text: string): unknown {
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(text.trim());
  try { return JSON.parse(fenced ? fenced[1] : text); }
  catch { throw new EditorAgentError('The local agent returned invalid JSON. Please retry.'); }
}

const commentsSchema = z.array(z.object({
  blockId: z.string().min(1), comment: z.string().trim().min(1), content: z.string().min(1),
}).strict()).min(1);
const cellsSchema = z.array(z.object({ id: z.string().min(1), content: z.string() }).strict()).min(1);

export function editorAgentCommand(
  editor: SlateEditor,
  messages: ChatMessage[],
  toolNameParam: unknown,
  complete: ReturnType<typeof prepareEditorAgent>,
  signal: AbortSignal
) {
  const isSelecting = editor.api.isExpanded();
  if (toolNameParam != null && !['generate', 'edit', 'comment'].includes(String(toolNameParam))) {
    throw new EditorAgentError('Choose a valid editor AI command.', 400);
  }
  if (!Array.isArray(messages) || !messages.some((message) => message.role === 'user' &&
    Array.isArray(message.parts) && message.parts.some((part) => part.type === 'text' && part.text.trim()))) {
    throw new EditorAgentError('No question was sent.', 400);
  }
  const doc = getMarkdown(editor, { type: 'editor' });
  const stream = createUIMessageStream<ChatMessage>({
    onError: (error) => error instanceof Error ? error.message : 'Local agent request failed.',
    execute: async ({ writer }) => {
      let toolName = toolNameParam as ToolName | undefined;
      writer.write({ type: 'start', messageId: nanoid() });
      if (!toolName) {
        const choice = await complete(getChooseToolPrompt({ isSelecting, messages }) +
          '\nReturn only one JSON string: "generate", "edit", or "comment".');
        const parsed = parseJSON(choice);
        if (parsed !== 'generate' && parsed !== 'comment' && !(isSelecting && parsed === 'edit')) {
          throw new EditorAgentError('The local agent chose an invalid editor command. Please retry.');
        }
        toolName = parsed;
      }
      writer.write({ type: 'data-toolName', data: toolName });
      writer.write({ type: 'start-step' });

      if (toolName === 'comment') {
        const blocks = editor.api.blocks({ mode: 'lowest' });
        const targets = new Map(blocks.map(([node], index) => [node.id, index]));
        const text = await complete(getCommentPrompt(editor, { messages }) +
          '\nReturn only a JSON array of {"blockId": "original block ID", "content": "original fragment", "comment": "comment text"}.', doc);
        const result = commentsSchema.safeParse(parseJSON(text));
        if (!result.success) throw new EditorAgentError('The local agent returned invalid comments. Please retry.');
        const comments: z.infer<typeof commentsSchema> = [];
        for (const comment of result.data) {
          const start = targets.get(comment.blockId);
          if (start === undefined) throw new EditorAgentError('The local agent returned an unknown comment target.');
          const fragments = deserializeMd(editor, comment.content);
          if (!fragments.length || fragments.some((fragment, index) => {
            const entry = blocks[start + index];
            const content = NodeApi.string(fragment);
            return !entry || !targets.has(entry[0].id) || !content.trim() || !NodeApi.string(entry[0]).includes(content);
          })) throw new EditorAgentError('The local agent returned a comment fragment that is not in the selected document blocks.');
          // Plate resolves later fragments as top-level siblings; split nested ranges by their original IDs.
          const firstPath = blocks[start][1];
          const needsSplit = fragments.length > 1 && fragments.some((_, index) => {
            const path = blocks[start + index][1];
            return path.length !== 1 || path[0] !== firstPath[0] + index;
          });
          if (needsSplit) {
            fragments.forEach((fragment, index) => comments.push({
              ...comment,
              blockId: String(blocks[start + index][0].id),
              content: serializeMd(editor, { value: [fragment] }).trim(),
            }));
          } else comments.push(comment);
        }
        signal.throwIfAborted();
        for (const comment of comments) writer.write({ type: 'data-comment', id: nanoid(), data: { comment, status: 'streaming' } });
        writer.write({ type: 'data-comment', id: nanoid(), data: { comment: null, status: 'finished' } });
      } else {
        const [prompt, editType] = toolName === 'edit'
          ? getEditPrompt(editor, { isSelecting, messages })
          : [getGeneratePrompt(editor, { isSelecting, messages }), undefined];
        if (editType === 'table') {
          const targets = new Set(getTableGridAbove(editor, { format: 'cell' }).map(([cell]) => cell.id).filter(Boolean));
          if (!targets.size) throw new EditorAgentError('No selected table cells were found.');
          const text = await complete(prompt + '\nReturn only a JSON array of {"id": "original selected cell ID", "content": "new cell content"}.', doc);
          const result = cellsSchema.safeParse(parseJSON(text));
          if (!result.success) throw new EditorAgentError('The local agent returned invalid table updates. Please retry.');
          const seen = new Set<string>();
          for (const cell of result.data) {
            if (!targets.has(cell.id) || seen.has(cell.id)) throw new EditorAgentError('The local agent returned an unknown or duplicate table cell target.');
            seen.add(cell.id);
          }
          signal.throwIfAborted();
          for (const cellUpdate of result.data) writer.write({ type: 'data-table', id: nanoid(), data: { cellUpdate, status: 'streaming' } });
          writer.write({ type: 'data-table', id: nanoid(), data: { cellUpdate: null, status: 'finished' } });
        } else {
          const text = await complete(prompt, doc);
          signal.throwIfAborted();
          const id = nanoid();
          writer.write({ type: 'text-start', id });
          writer.write({ type: 'text-delta', id, delta: text });
          writer.write({ type: 'text-end', id });
        }
      }
      writer.write({ type: 'finish-step' });
      writer.write({ type: 'finish', finishReason: 'stop' });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export async function editorAgentCopilot(
  body: AgentRequest & { instructions?: unknown; system?: unknown; prompt?: unknown },
  allowLocalAgent: boolean,
  signal: AbortSignal,
  runner?: EditorAgentRunner
) {
  try {
    const complete = prepareEditorAgent(body, allowLocalAgent, signal, runner);
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) return Response.json({ text: '0' });
    const instructions = body.instructions ?? body.system ?? '';
    if (typeof instructions !== 'string') throw new EditorAgentError('Invalid completion instructions.', 400);
    const text = await complete(`${instructions}\n\n${body.prompt}\n\nReturn only a short inline continuation of at most 50 words and 300 characters, ending at the next punctuation mark. If no continuation is possible, return exactly 0.`);
    const words = Array.from(text.matchAll(/\S+/g));
    const wordEnd = words.length > 50 ? words[49].index + words[49][0].length : text.length;
    const bounded = text.slice(0, wordEnd).slice(0, 300);
    const end = /[.,;:?!](?=\s|$)/.exec(bounded);
    return Response.json({ text: text.trim() === '0' ? '0' : end ? bounded.slice(0, end.index + 1) : '0' });
  } catch (error) { return editorAgentError(error); }
}
