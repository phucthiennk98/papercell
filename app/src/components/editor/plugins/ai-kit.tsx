'use client';

import cloneDeep from 'lodash/cloneDeep.js';
import {
  AIChatPlugin,
  AIPlugin,
  acceptAISuggestions,
  useChatChunk,
} from '@platejs/ai/react';
import { deserializeMd } from '@platejs/markdown';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import { diffToSuggestions } from '@platejs/suggestion';
import {
  type NodeEntry,
  type TElement,
  ElementApi,
  KEYS,
  nanoid,
  NodeApi,
  PathApi,
  RangeApi,
  type Value,
} from 'platejs';
import { type PlateEditor } from 'platejs/react';

import { aiTaskStore, type AITaskKind } from '@/ai/ai-task-store';
import {
  deserializeMarkdownWithFigures,
  extractFigureSegments,
  extractFiguresFromNode,
  isFigurePrompt,
  mergeUpdatedNodesIntoColumnGroup,
  serializeFigureJson,
  wrapColumnGroupEditPrompt,
  wrapFigureEditPrompt,
  wrapFigurePrompt,
} from '@/ai/figure-nodes';
import { AILoadingBar, AIMenu } from '@/components/ui/ai-menu';
import { AIAnchorElement, AILeaf } from '@/components/ui/ai-node';
import type { FigureNode } from '@/editor/types';

import { useChat } from '../use-chat';
import { CursorOverlayKit } from './cursor-overlay-kit';
import { MarkdownKit } from './markdown-kit';

function markTransient(nodes: Value): Value {
  return nodes.map((node: any) => {
    const id = nanoid();
    const n = { ...node, id };
    if (ElementApi.isElement(n) && n.children) {
      n.children = markTransient(n.children as Value);
    }
    if (n.suggestion) {
      n.suggestion = { ...n.suggestion, isTransient: true };
    }
    return n;
  });
}

/**
 * Find a block anywhere in the document by its `id`, independent of `editor.selection`.
 */
export function findBlockById(
  editor: PlateEditor,
  id: string | null | undefined
): NodeEntry<TElement> | undefined {
  if (!id) return undefined;
  return editor.api.node<TElement>({
    at: [],
    block: true,
    match: (n: any) => ElementApi.isElement(n) && n.id === id,
  });
}

/**
 * Ensure a Slate block element has a persistent `id` in `editor.children`.
 */
export function ensureBlockId(editor: PlateEditor, element: TElement): string {
  if (element.id) return element.id as string;
  const id = nanoid();
  const path = editor.api.findPath(element);
  if (path) {
    editor.tf.withoutSaving(() => {
      editor.tf.setNodes({ id } as any, { at: path });
    });
  }
  (element as any).id = id;
  return id;
}

function getSelectedRootBlockId(editor: PlateEditor): string | null {
  if (!editor.selection) return null;
  const entry = editor.api.block({ at: editor.selection.focus, highest: true });
  return (entry?.[0]?.id as string) ?? null;
}

function replacePinnedBlocks(
  editor: PlateEditor,
  blockIds: string[],
  nextNodes: any[]
): string[] {
  if (!blockIds.length || !nextNodes.length) return [];
  const firstEntry = findBlockById(editor, blockIds[0]);
  if (!firstEntry) return [];

  const activeBlockId = getSelectedRootBlockId(editor);
  const savedSelection =
    activeBlockId && !blockIds.includes(activeBlockId)
      ? cloneDeep(editor.selection)
      : null;

  const assigned = nextNodes.map((n) => ({
    ...n,
    id: (n.id as string) || nanoid(),
  }));
  const nextIds = assigned.map((n) => n.id as string);

  editor.tf.withoutNormalizing(() => {
    editor.tf.deselect();
    editor.tf.replaceNodes(assigned, {
      at: firstEntry[1],
    });
    blockIds.slice(1).forEach((id) => {
      editor.tf.removeNodes({
        at: [],
        match: (n: any) => n.id === id,
      });
    });
    if (savedSelection) {
      try {
        editor.tf.select(savedSelection);
      } catch {
        editor.tf.deselect();
      }
    }
  });

  return nextIds;
}

/**
 * Open the in-editor AI command menu directly on a specific block (figure card, text cell, equation, or container).
 * Stores `menuTargetId` in `aiTaskStore` without triggering `BlockSelectionPlugin`'s shadow input focus steal.
 */
export function openAIChatOnElement(editor: PlateEditor, element: TElement) {
  const id = ensureBlockId(editor, element);
  editor.getApi(BlockSelectionPlugin).blockSelection.clear();
  aiTaskStore.set({ menuTargetId: id });

  editor.setOption(AIChatPlugin, 'open', false);
  window.requestAnimationFrame(() => {
    editor.setOption(AIChatPlugin, 'open', true);
  });
}

export function acceptCellAITask(editor: PlateEditor) {
  const task = aiTaskStore.get();
  if (task.status === 'idle') return;

  if (task.taskKind === 'edit' && !task.hasFigures) {
    try {
      acceptAISuggestions(editor);
    } catch {
      // ignore if suggestions already accepted
    }
  }
  editor.getApi(BlockSelectionPlugin).blockSelection.clear();
  aiTaskStore.reset();
}

export function discardCellAITask(editor: PlateEditor) {
  const task = aiTaskStore.get();
  if (task.status === 'idle') return;

  editor.getApi(AIChatPlugin).aiChat.stop();

  if (task.blockIds.length > 0) {
    const firstEntry = findBlockById(editor, task.blockIds[0]);
    if (firstEntry) {
      editor.tf.withoutNormalizing(() => {
        editor.tf.deselect();
        if (task.createdPlaceholder || task.originalBlocks.length === 0) {
          task.blockIds.forEach((id) => {
            editor.tf.removeNodes({
              at: [],
              match: (n: any) => n.id === id,
            });
          });
        } else {
          const restored = cloneDeep(task.originalBlocks);
          editor.tf.replaceNodes(restored, { at: firstEntry[1] });
          task.blockIds.slice(1).forEach((id) => {
            editor.tf.removeNodes({
              at: [],
              match: (n: any) => n.id === id,
            });
          });
        }
      });
    }
  }

  editor.getApi(BlockSelectionPlugin).blockSelection.clear();
  aiTaskStore.reset();
}

export function stopCellAITask(editor: PlateEditor) {
  const task = aiTaskStore.get();
  if (task.status !== 'running') return;
  discardCellAITask(editor);
}

export function startCellAITask(
  editor: PlateEditor,
  opts: {
    input?: string;
    insertBelow?: boolean;
    label: string;
    prompt: string | { default: string; selecting: string };
    toolName: 'edit' | 'generate' | 'comment';
    mode?: 'insert' | 'chat';
  }
) {
  const menuTargetId = aiTaskStore.get().menuTargetId;

  // Finalize any previous review task first
  if (aiTaskStore.get().status === 'review') {
    acceptCellAITask(editor);
  } else if (aiTaskStore.get().status === 'running') {
    discardCellAITask(editor);
  }

  const menuTargetEntry = findBlockById(editor, menuTargetId);
  const selectedBlocks = menuTargetEntry
    ? [menuTargetEntry]
    : editor.getApi(BlockSelectionPlugin).blockSelection.getNodes({ sort: true });
  const isExpanded = editor.selection ? editor.api.isExpanded() : false;
  const isSelecting = selectedBlocks.length > 0 || isExpanded;

  let resolvedPrompt =
    typeof opts.prompt === 'string'
      ? opts.prompt
      : isSelecting
        ? opts.prompt.selecting
        : opts.prompt.default;

  let resolvedToolName = opts.toolName;

  let blockIds: string[] = [];
  let originalBlocks: any[] = [];
  let createdPlaceholder = false;
  let targetRangeForEdit: any = null;
  let taskKind: AITaskKind =
    resolvedToolName === 'edit'
      ? 'edit'
      : isSelecting
        ? 'generate'
        : 'insert';

  const wantsFigure =
    resolvedToolName === 'generate' &&
    isFigurePrompt(opts.input || opts.label || resolvedPrompt);

  if (selectedBlocks.length > 0) {
    const lastSelected = selectedBlocks.at(-1)!;
    const firstNode = selectedBlocks[0][0] as any;
    const firstPath = selectedBlocks[0][1];
    const hasInnerFigures = extractFiguresFromNode(firstNode).length > 0;
    const isFirstEmpty =
      !hasInnerFigures &&
      firstNode?.type !== 'figure' &&
      firstNode?.type !== KEYS.equation &&
      editor.api.isEmpty(firstNode);

    // If user asked to create a new figure from a non-empty text cell (without existing figures), insert below
    const shouldInsertBelow =
      Boolean(opts.insertBelow) ||
      (wantsFigure && !hasInnerFigures && !isFirstEmpty);

    if (shouldInsertBelow) {
      if (firstNode?.type === 'figure') {
        resolvedPrompt = `Target figure card JSON:\n\`\`\`papercell-figure\n${serializeFigureJson(firstNode as FigureNode)}\n\`\`\`\n\n${resolvedPrompt}`;
      } else if (hasInnerFigures) {
        const figs = extractFiguresFromNode(firstNode);
        resolvedPrompt = `Target multi-column figures:\n${figs.map((f) => `\`\`\`papercell-figure\n${serializeFigureJson(f)}\n\`\`\``).join('\n\n')}\n\n${resolvedPrompt}`;
      } else if (firstNode?.type === KEYS.equation) {
        resolvedPrompt = `Target LaTeX equation:\n$$\n${firstNode.texExpression || ''}\n$$\n\n${resolvedPrompt}`;
      }
      const placeholderId = nanoid();
      const placeholder = {
        id: placeholderId,
        type: KEYS.p,
        children: [{ text: '' }],
      };
      const insertAtPath =
        lastSelected[1].length >= 3
          ? PathApi.next(lastSelected[1])
          : PathApi.next(lastSelected[1].slice(0, 1));
      editor.tf.withoutSaving(() => {
        editor.tf.insertNodes(placeholder, { at: insertAtPath });
      });
      blockIds = [placeholderId];
      originalBlocks = [];
      createdPlaceholder = true;
      taskKind = 'insert';
    } else {
      blockIds = selectedBlocks.map(([node]) => ensureBlockId(editor, node));
      originalBlocks = cloneDeep(selectedBlocks.map(([node]) => node));
      if (selectedBlocks.length === 1) {
        targetRangeForEdit = editor.api.range(firstPath);
      } else {
        targetRangeForEdit = editor.api.nodesRange(selectedBlocks);
      }
    }
  } else {
    const entry =
      editor.api.block({ highest: true }) ??
      editor.api.block({
        at: [Math.max(0, editor.children.length - 1)],
        highest: true,
      });

    if (entry) {
      const [ancestor, path] = entry;
      const ancestorId = ensureBlockId(editor, ancestor);
      const hasInnerFigures = extractFiguresFromNode(ancestor).length > 0;
      const isEmpty =
        !hasInnerFigures &&
        ancestor.type !== 'figure' &&
        ancestor.type !== KEYS.equation &&
        editor.api.isEmpty(ancestor);

      if (
        !opts.insertBelow &&
        (resolvedToolName === 'edit' ||
          isEmpty ||
          isSelecting ||
          hasInnerFigures ||
          ancestor.type === 'figure' ||
          ancestor.type === KEYS.equation)
      ) {
        blockIds = [ancestorId];
        originalBlocks = [cloneDeep(ancestor)];
        targetRangeForEdit = editor.api.range(path);
      } else {
        // Insert a dedicated target placeholder block right below the non-empty block
        const placeholderId = nanoid();
        const placeholder = {
          id: placeholderId,
          type: KEYS.p,
          children: [{ text: '' }],
        };
        const nextPath =
          path.length >= 3 ? PathApi.next(path) : PathApi.next(path.slice(0, 1));
        editor.tf.withoutSaving(() => {
          editor.tf.insertNodes(placeholder, { at: nextPath });
        });
        blockIds = [placeholderId];
        originalBlocks = [];
        createdPlaceholder = true;
        taskKind = 'insert';
      }
    }
  }

  // Handle special block types (figure, column_group with figures, equation, or edit fallback)
  if (
    !createdPlaceholder &&
    originalBlocks.length === 1 &&
    originalBlocks[0]?.type === 'figure'
  ) {
    const fig = originalBlocks[0] as FigureNode;
    if (!resolvedPrompt.includes('papercell-figure')) {
      resolvedPrompt = wrapFigureEditPrompt(
        fig,
        opts.input || resolvedPrompt || opts.label
      );
    }
    resolvedToolName = 'generate';
    taskKind = 'generate';
  } else if (
    !createdPlaceholder &&
    originalBlocks.length === 1 &&
    originalBlocks[0]?.type === KEYS.columnGroup &&
    extractFiguresFromNode(originalBlocks[0]).length > 0
  ) {
    if (!resolvedPrompt.includes('papercell-figure')) {
      resolvedPrompt = wrapColumnGroupEditPrompt(
        originalBlocks[0],
        opts.input || resolvedPrompt || opts.label
      );
    }
    resolvedToolName = 'generate';
    taskKind = 'generate';
  } else if (
    !createdPlaceholder &&
    originalBlocks.length === 1 &&
    originalBlocks[0]?.type === KEYS.equation
  ) {
    const tex = String(originalBlocks[0].texExpression ?? '').trim();
    resolvedPrompt = `Current LaTeX equation block:\n$$\n${tex}\n$$\n\nUser instruction:\n${opts.input || resolvedPrompt || opts.label}\n\nOutput ONLY the updated display equation wrapped in $$ ... $$ (do not add surrounding explanation unless explicitly asked).`;
    resolvedToolName = 'generate';
    taskKind = 'generate';
  } else if (
    resolvedToolName === 'generate' &&
    isFigurePrompt(opts.input || opts.label || resolvedPrompt) &&
    !resolvedPrompt.includes('papercell-figure')
  ) {
    resolvedPrompt = wrapFigurePrompt(
      opts.input || opts.label || resolvedPrompt
    );
  } else if (resolvedToolName === 'edit') {
    const hasExpandedRange =
      targetRangeForEdit && RangeApi.isExpanded(targetRangeForEdit);
    if (hasExpandedRange) {
      editor.tf.select(targetRangeForEdit);
    } else {
      const currentText = originalBlocks
        .map((n: any) => NodeApi.string(n))
        .join('\n\n')
        .trim();
      if (currentText) {
        resolvedPrompt = `Current block content:\n${currentText}\n\nUser instruction:\n${opts.input || resolvedPrompt || opts.label}\n\nOutput only the updated Markdown content for this block.`;
      }
      resolvedToolName = 'generate';
    }
  }

  const originalText = originalBlocks
    .map((n: any) =>
      n.type === 'figure'
        ? `[Figure: ${n.caption || 'Untitled'}]`
        : n.type === KEYS.equation
          ? `$$${n.texExpression || ''}$$`
          : NodeApi.string(n)
    )
    .join('\n\n')
    .trim();

  aiTaskStore.set({
    status: 'running',
    menuTargetId: null,
    blockIds,
    originalBlocks,
    createdPlaceholder,
    originalText,
    promptLabel: opts.label || opts.input || 'AI request',
    promptSent: resolvedPrompt,
    toolName: resolvedToolName,
    taskKind,
    startedAt: Date.now(),
    content: '',
    hasFigures: false,
    error: undefined,
  });

  // Hide the command menu popover without resetting/stopping the chat
  editor.setOption(AIChatPlugin, 'open', false);

  // Submit the request to Plate AI chat
  void editor.getApi(AIChatPlugin).aiChat.submit(opts.input ?? '', {
    mode:
      opts.mode ??
      (resolvedToolName === 'edit' || isSelecting ? 'chat' : 'insert'),
    prompt: resolvedPrompt,
    toolName: resolvedToolName,
  });

  // Free block selection so the user can edit any other block while waiting
  setTimeout(() => {
    editor.getApi(BlockSelectionPlugin).blockSelection.clear();
  }, 0);
}

export function retryCellAITask(editor: PlateEditor) {
  const task = aiTaskStore.get();
  if (task.status === 'idle') return;
  const { promptLabel, promptSent, toolName, blockIds, originalBlocks } = task;

  let retryTargetId: string | null = null;

  // Restore original blocks first
  if (blockIds.length > 0 && originalBlocks.length > 0) {
    const firstEntry = findBlockById(editor, blockIds[0]);
    if (firstEntry) {
      const restored = cloneDeep(originalBlocks);
      editor.tf.withoutNormalizing(() => {
        editor.tf.deselect();
        editor.tf.replaceNodes(restored, { at: firstEntry[1] });
        blockIds.slice(1).forEach((id) => {
          editor.tf.removeNodes({
            at: [],
            match: (n: any) => n.id === id,
          });
        });
      });
      retryTargetId = (restored[0]?.id as string) ?? null;
    }
  } else if (blockIds.length > 0) {
    retryTargetId = blockIds[0];
  }

  aiTaskStore.reset();
  if (retryTargetId) {
    aiTaskStore.set({ menuTargetId: retryTargetId });
  }
  startCellAITask(editor, {
    input: '',
    label: promptLabel,
    prompt: promptSent,
    toolName,
  });
}

function applyFinishedCellTask(editor: PlateEditor, content: string) {
  const task = aiTaskStore.get();
  if (task.status !== 'running' || !task.blockIds.length) return;
  const trimmed = content.trim();
  if (!trimmed) {
    discardCellAITask(editor);
    return;
  }

  // If the target block was a multi-column cell (column_group), merge updated figures/blocks back into the columns
  if (
    task.originalBlocks.length === 1 &&
    task.originalBlocks[0]?.type === KEYS.columnGroup
  ) {
    const aiNodes = deserializeMarkdownWithFigures(editor, trimmed);
    if (aiNodes.length > 0) {
      const mergedGroup = mergeUpdatedNodesIntoColumnGroup(
        task.originalBlocks[0],
        aiNodes
      );
      const nextIds = replacePinnedBlocks(editor, task.blockIds, [mergedGroup]);
      aiTaskStore.set({
        status: 'review',
        blockIds: nextIds.length ? nextIds : task.blockIds,
        content: trimmed,
        hasFigures: extractFiguresFromNode(mergedGroup).length > 0,
      });
      return;
    }
  }

  const parsed = extractFigureSegments(trimmed);
  if (parsed.figures.length > 0) {
    let figNodes = deserializeMarkdownWithFigures(editor, trimmed);
    if (
      task.originalBlocks.length === 1 &&
      task.originalBlocks[0]?.type === 'figure' &&
      figNodes.length > 0
    ) {
      const origFig = task.originalBlocks[0] as FigureNode;
      figNodes = figNodes.map((node: any, idx: number) => {
        if (idx === 0 && node.type === 'figure') {
          return {
            ...node,
            id: origFig.id,
            display: origFig.display,
            codeAccess: origFig.codeAccess,
            padding: origFig.padding,
            python: node.python?.trim() ? node.python : origFig.python,
          };
        }
        return node;
      });
    }
    if (figNodes.length > 0) {
      const nextIds = replacePinnedBlocks(editor, task.blockIds, figNodes);
      aiTaskStore.set({
        status: 'review',
        blockIds: nextIds.length ? nextIds : task.blockIds,
        content: trimmed,
        hasFigures: true,
      });
      return;
    }
  }

  if (task.taskKind === 'edit' && task.originalBlocks.length > 0) {
    const aiNodes = deserializeMd(editor, trimmed);
    if (aiNodes && aiNodes.length > 0) {
      const diffNodes = markTransient(
        diffToSuggestions(editor, task.originalBlocks, aiNodes)
      );
      const nextIds = replacePinnedBlocks(
        editor,
        task.blockIds,
        diffNodes as any[]
      );
      aiTaskStore.set({
        status: 'review',
        blockIds: nextIds.length ? nextIds : task.blockIds,
        content: trimmed,
        hasFigures: false,
      });
      return;
    }
  }

  const mdNodes = deserializeMarkdownWithFigures(editor, trimmed);
  if (mdNodes.length > 0) {
    const nextIds = replacePinnedBlocks(editor, task.blockIds, mdNodes);
    aiTaskStore.set({
      status: 'review',
      blockIds: nextIds.length ? nextIds : task.blockIds,
      content: trimmed,
      hasFigures: false,
    });
  } else {
    discardCellAITask(editor);
  }
}

export const aiChatPlugin = AIChatPlugin.extend({
  options: {
    chatOptions: {
      api: '/api/ai/command',
      body: {},
    },
  },
  render: {
    afterContainer: AILoadingBar,
    afterEditable: AIMenu,
    node: AIAnchorElement,
  },
  shortcuts: { show: { keys: 'mod+j' } },
  useHooks: ({ editor }) => {
    useChat();

    useChatChunk({
      onChunk: ({ text: content }) => {
        if (aiTaskStore.get().status === 'running') {
          aiTaskStore.set({ content });
        }
      },
      onFinish: ({ content }) => {
        const finalContent = content || aiTaskStore.get().content;
        if (aiTaskStore.get().status === 'running') {
          applyFinishedCellTask(editor, finalContent);
        }
        editor.getApi(AIChatPlugin).aiChat.stop();
      },
    });
  },
});

export const AIKit = [
  ...CursorOverlayKit,
  ...MarkdownKit,
  AIPlugin.withComponent(AILeaf),
  aiChatPlugin,
];
