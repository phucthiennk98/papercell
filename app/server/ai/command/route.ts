import type {
  ChatMessage,
  ToolName,
} from '@/components/editor/use-chat';


import {
  type LanguageModel,
  type UIMessageStreamWriter,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  Output,
  streamText,
  tool,
  toUIMessageStream,
} from 'ai';

import { type SlateEditor, createSlateEditor, nanoid } from 'platejs';
import { z } from 'zod';

import { BaseEditorKit } from '@/components/editor/editor-base-kit';
import { readConfig, resolveModel } from '../provider';
import { editorAgentCommand, editorAgentError, prepareEditorAgent, type EditorAgentRunner } from '../editor-agent';
import { markdownJoinerTransform } from '@/lib/markdown-joiner-transform';

import {
  buildEditTableMultiCellPrompt,
  getChooseToolPrompt,
  getCommentPrompt,
  getEditPrompt,
  getGeneratePrompt,
} from './prompt';

export async function POST(req: Request, allowLocalAgent = false, runner?: EditorAgentRunner) {
  const body = await req.json();
  const { ctx, messages: messagesRaw } = body;

  if (body.aiMode === 'agent') {
    try {
      const complete = prepareEditorAgent(body, allowLocalAgent, req.signal, runner);
      if (!ctx || !Array.isArray(ctx.children)) return Response.json({ error: 'Missing editor context.' }, { status: 400 });
      const editor = createSlateEditor({
        plugins: BaseEditorKit,
        selection: ctx.selection,
        value: structuredClone(ctx.children),
      });
      return editorAgentCommand(editor, messagesRaw, ctx.toolName, complete, req.signal);
    } catch (error) { return editorAgentError(error); }
  }

  let llm: LanguageModel;
  try {
    llm = resolveModel(readConfig(body));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 401 });
  }

  const { children, selection, toolName: toolNameParam } = ctx;

  const editor = createSlateEditor({
    plugins: BaseEditorKit,
    selection,
    value: children,
  });

  const isSelecting = editor.api.isExpanded();


  try {
    const stream = createUIMessageStream<ChatMessage>({
      execute: async ({ writer }) => {
        let toolName = toolNameParam;

        if (!toolName) {
          const prompt = getChooseToolPrompt({
            isSelecting,
            messages: messagesRaw,
          });

          const enumOptions = isSelecting
            ? ['generate', 'edit', 'comment']
            : ['generate', 'comment'];

          const { output: AIToolName } = await generateText({
            model: llm,
            output: Output.choice({ options: enumOptions }),
            prompt,
          });

          writer.write({
            data: AIToolName as ToolName,
            type: 'data-toolName',
          });

          toolName = AIToolName;
        }

        const tools = {
          comment: getCommentTool(editor, {
            messagesRaw,
            model: llm,
            writer,
          }),
          table: getTableTool(editor, {
            messagesRaw,
            model: llm,
            writer,
          }),
        };

        const result = streamText({
          experimental_transform: markdownJoinerTransform(),
          model: llm,
          // Not used
          prompt: '',
          tools,
          prepareStep: async (step) => {
            if (toolName === 'comment') {
              return {
                ...step,
                toolChoice: { toolName: 'comment', type: 'tool' },
              };
            }

            if (toolName === 'edit') {
              const [editPrompt, editType] = getEditPrompt(editor, {
                isSelecting,
                messages: messagesRaw,
              });

              // Table editing uses the table tool
              if (editType === 'table') {
                return {
                  ...step,
                  toolChoice: { toolName: 'table', type: 'tool' },
                };
              }

              return {
                ...step,
                activeTools: [],
                model:
                  editType === 'selection'
                    ? //The selection task is more challenging, so we chose to use Gemini 2.5 Flash.
                      llm
                    : llm,
                messages: [
                  {
                    content: editPrompt,
                    role: 'user',
                  },
                ],
              };
            }

            if (toolName === 'generate') {
              const generatePrompt = getGeneratePrompt(editor, {
                isSelecting,
                messages: messagesRaw,
              });

              return {
                ...step,
                activeTools: [],
                messages: [
                  {
                    content: generatePrompt,
                    role: 'user',
                  },
                ],
                model: llm,
              };
            }
          },
        });

        writer.merge(
          toUIMessageStream({
            sendFinish: false,
            stream: result.stream,
            tools,
          })
        );
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch {
    return Response.json(
      { error: 'Failed to process AI request' },
      { status: 500 }
    );
  }
}

const getCommentTool = (
  editor: SlateEditor,
  {
    messagesRaw,
    model,
    writer,
  }: {
    messagesRaw: ChatMessage[];
    model: LanguageModel;
    writer: UIMessageStreamWriter<ChatMessage>;
  }
) =>
  tool({
    description: 'Comment on the content',
    inputSchema: z.object({}),
    strict: true,
    execute: async () => {
      const commentSchema = z.object({
        blockId: z
          .string()
          .describe(
            'The id of the starting block. If the comment spans multiple blocks, use the id of the first block.'
          ),
        comment: z
          .string()
          .describe('A brief comment or explanation for this fragment.'),
        content: z
          .string()
          .describe(
            String.raw`The original document fragment to be commented on.It can be the entire block, a small part within a block, or span multiple blocks. If spanning multiple blocks, separate them with two \n\n.`
          ),
      });

      const { elementStream } = streamText({
        model,
        output: Output.array<z.infer<typeof commentSchema>>({
          element: commentSchema,
        }),
        prompt: getCommentPrompt(editor, {
          messages: messagesRaw,
        }),
      });

      for await (const comment of elementStream) {
        writer.write({
          id: nanoid(),
          data: {
            comment,
            status: 'streaming',
          },
          type: 'data-comment',
        });
      }

      writer.write({
        id: nanoid(),
        data: {
          comment: null,
          status: 'finished',
        },
        type: 'data-comment',
      });
    },
  });

const getTableTool = (
  editor: SlateEditor,
  {
    messagesRaw,
    model,
    writer,
  }: {
    messagesRaw: ChatMessage[];
    model: LanguageModel;
    writer: UIMessageStreamWriter<ChatMessage>;
  }
) =>
  tool({
    description: 'Edit table cells',
    inputSchema: z.object({}),
    strict: true,
    execute: async () => {
      const cellUpdateSchema = z.object({
        content: z
          .string()
          .describe(
            String.raw`The new content for the cell. Can contain multiple paragraphs separated by \n\n.`
          ),
        id: z.string().describe('The id of the table cell to update.'),
      });

      const { elementStream } = streamText({
        model,
        output: Output.array<z.infer<typeof cellUpdateSchema>>({
          element: cellUpdateSchema,
        }),
        prompt: buildEditTableMultiCellPrompt(editor, messagesRaw),
      });

      for await (const cellUpdate of elementStream) {
        writer.write({
          id: nanoid(),
          data: {
            cellUpdate,
            status: 'streaming',
          },
          type: 'data-table',
        });
      }

      writer.write({
        id: nanoid(),
        data: {
          cellUpdate: null,
          status: 'finished',
        },
        type: 'data-table',
      });
    },
  });
