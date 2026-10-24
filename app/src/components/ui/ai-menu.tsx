'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

import {
  AIChatPlugin,
  useEditorChat,
} from '@platejs/ai/react';
import { getTransientCommentKey } from '@platejs/comment';
import { BlockSelectionPlugin, useIsSelecting } from '@platejs/selection/react';
import { Command as CommandPrimitive } from 'cmdk';
import {
  Album,
  ArrowUp,
  BadgeHelp,
  ChartColumn,
  Check,
  Code2,
  CornerUpLeft,
  FeatherIcon,
  FileText,
  ListMinus,
  ListPlus,
  Loader2Icon,
  Paperclip,
  PauseIcon,
  PenLine,
  RadicalIcon,
  Sparkles,
  SmileIcon,
  Wand,
  X,
} from 'lucide-react';
import {
  type NodeEntry,
  type SlateEditor,
  isHotkey,
  KEYS,
  NodeApi,
  TextApi,
} from 'platejs';
import {
  useEditorPlugin,
  useHotkeys,
  usePluginOption,
} from 'platejs/react';
import { type PlateEditor, useEditorRef } from 'platejs/react';

import { aiTaskStore, useAITask } from '@/ai/ai-task-store';
import {
  buildPromptWithAttachments,
  readClipboardAttachments,
  readFileListAttachments,
  type AIAttachment,
} from '@/ai/chat-history';
import {
  extractFiguresFromNode,
  isEquationPrompt,
  isFigurePrompt,
  wrapEquationPrompt,
  wrapFigurePrompt,
} from '@/ai/figure-nodes';
import {
  acceptCellAITask,
  discardCellAITask,
  findBlockById,
  retryCellAITask,
  startCellAITask,
  stopCellAITask,
} from '@/components/editor/plugins/ai-kit';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { commentPlugin } from '@/components/editor/plugins/comment-kit';

function getActiveMenuTargetBlocks(editor: PlateEditor): NodeEntry[] {
  const menuTargetId = aiTaskStore.get().menuTargetId;
  const menuTargetEntry = findBlockById(editor, menuTargetId);
  if (menuTargetEntry) {
    return [menuTargetEntry];
  }
  return editor.getApi(BlockSelectionPlugin).blockSelection.getNodes({
    sort: true,
  });
}

function submitCustomInput(
  editor: PlateEditor,
  rawInput: string,
  attachments: AIAttachment[] = []
) {
  const cleanText = rawInput.trim();
  if (!cleanText && attachments.length === 0) return;

  const text = buildPromptWithAttachments(cleanText, attachments, {
    embedImageTag: true,
  });
  const shortLabel =
    cleanText ||
    `Reference: ${attachments.map((a) => a.name).join(', ')}`;

  const selectedBlocks = getActiveMenuTargetBlocks(editor);
  const isExpanded = editor.selection ? editor.api.isExpanded() : false;
  const firstNode = selectedBlocks[0]?.[0] as any;
  const isFigureGroup =
    selectedBlocks.length === 1 &&
    firstNode?.type === KEYS.columnGroup &&
    extractFiguresFromNode(firstNode).length > 0;
  const isFigureBlock =
    (selectedBlocks.length === 1 && firstNode?.type === 'figure') ||
    isFigureGroup;
  const isEquationBlock =
    selectedBlocks.length === 1 && firstNode?.type === KEYS.equation;
  const isNonEmptyBlock =
    selectedBlocks.length > 0 &&
    !isFigureBlock &&
    !isEquationBlock &&
    !editor.api.isEmpty(firstNode);
  const isSelecting = isNonEmptyBlock || isExpanded;

  if (isFigureBlock) {
    startCellAITask(editor, {
      input: text,
      label: isFigureGroup
        ? `Edit figures in cell: ${shortLabel}`
        : `Edit figure: ${shortLabel}`,
      mode: 'insert',
      prompt: text,
      toolName: 'generate',
    });
    return;
  }

  if (isEquationBlock) {
    startCellAITask(editor, {
      input: text,
      label: `Edit equation: ${shortLabel}`,
      mode: 'insert',
      prompt: text,
      toolName: 'generate',
    });
    return;
  }

  if (isFigurePrompt(cleanText)) {
    startCellAITask(editor, {
      input: text,
      label: shortLabel,
      mode: 'insert',
      prompt: wrapFigurePrompt(text),
      toolName: 'generate',
    });
    return;
  }

  if (isEquationPrompt(cleanText)) {
    startCellAITask(editor, {
      input: text,
      label: shortLabel,
      mode: 'insert',
      prompt: wrapEquationPrompt(text),
      toolName: 'generate',
    });
    return;
  }

  startCellAITask(editor, {
    input: text,
    label: shortLabel,
    mode: isSelecting ? 'chat' : 'insert',
    prompt: text,
    toolName: isSelecting ? 'edit' : 'generate',
  });
}

function AICellOverlay({ editor }: { editor: PlateEditor }) {
  const task = useAITask();
  const [box, setBox] = React.useState<{
    top: number;
    left: number;
    width: number;
    bottom: number;
    visible: boolean;
  } | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (task.status !== 'running') return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [task.status]);

  React.useEffect(() => {
    if (task.status === 'idle' || task.blockIds.length === 0) {
      setBox(null);
      return;
    }

    const activeClass =
      task.status === 'running' ? 'ai-cell-active' : 'ai-cell-review';
    const decoratedDoms: HTMLElement[] = [];

    const updatePosition = () => {
      const doms: HTMLElement[] = [];
      for (const id of task.blockIds) {
        const entry = findBlockById(editor, id);
        if (entry) {
          const dom = editor.api.toDOMNode(entry[0]);
          if (dom) doms.push(dom);
        }
      }

      // Sync highlight class on target DOM blocks
      decoratedDoms.forEach((el) => {
        if (!doms.includes(el)) {
          el.classList.remove('ai-cell-active', 'ai-cell-review');
        }
      });
      doms.forEach((el) => {
        el.classList.remove(
          task.status === 'running' ? 'ai-cell-review' : 'ai-cell-active'
        );
        el.classList.add(activeClass);
        if (!decoratedDoms.includes(el)) decoratedDoms.push(el);
      });

      if (doms.length === 0) {
        setBox(null);
        return;
      }

      const firstRect = doms[0].getBoundingClientRect();
      const lastRect = doms[doms.length - 1].getBoundingClientRect();
      const visible =
        lastRect.bottom > 48 && firstRect.top < window.innerHeight - 32;

      setBox({
        top: firstRect.top,
        left: firstRect.left,
        width: Math.max(280, firstRect.width),
        bottom: lastRect.bottom,
        visible,
      });
    };

    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      decoratedDoms.forEach((el) =>
        el.classList.remove('ai-cell-active', 'ai-cell-review')
      );
    };
  }, [editor, task.blockIds, task.status, task.content]);

  if (task.status === 'idle' || !box || !box.visible) return null;

  const elapsedSec = Math.max(
    1,
    Math.round((now - (task.startedAt || now)) / 1000)
  );
  const wasExistingFigure =
    task.originalBlocks.length === 1 &&
    (task.originalBlocks[0]?.type === 'figure' ||
      (task.originalBlocks[0]?.type === KEYS.columnGroup &&
        extractFiguresFromNode(task.originalBlocks[0]).length > 0));

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: Math.min(window.innerHeight - 160, box.bottom + 6),
        left: box.left,
        width: Math.min(box.width, 640),
        zIndex: 45,
      }}
      className="pointer-events-auto"
    >
      {task.status === 'running' && (
        <div className="rounded-lg border border-blue-200 bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <Loader2Icon className="size-3.5 animate-spin" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Sparkles className="size-3 text-blue-600" />
                <span className="truncate">
                  AI is working on this cell: &ldquo;{task.promptLabel}&rdquo;
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {task.content
                  ? `Streaming response (${task.content.length} chars)… You can keep editing other blocks.`
                  : 'Generating… You can freely edit other blocks while waiting.'}
              </div>
            </div>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
              {elapsedSec}s
            </span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => stopCellAITask(editor)}
              className="flex shrink-0 items-center gap-1 rounded-md border bg-background px-2 py-1 font-medium text-foreground hover:bg-accent"
            >
              <PauseIcon className="size-3" />
              Stop
            </button>
          </div>
        </div>
      )}

      {task.status === 'review' && (
        <div className="rounded-lg border border-emerald-200 bg-background/95 p-2.5 text-xs shadow-lg backdrop-blur-sm space-y-2">
          {task.taskKind === 'edit' && !task.hasFigures && (
            <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border bg-muted/20 p-2">
              <div className="font-medium text-muted-foreground">
                Proposed changes (Old vs New)
              </div>
              {task.originalText && (
                <div className="rounded border border-red-200 bg-red-50/90 px-2 py-1 text-red-700 line-through decoration-red-700/70 whitespace-pre-wrap">
                  {task.originalText}
                </div>
              )}
              <div className="rounded border border-emerald-200 bg-emerald-50/90 px-2 py-1 text-emerald-800 whitespace-pre-wrap">
                {task.content}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              {task.hasFigures ? (
                <>
                  <ChartColumn className="size-3.5 text-blue-600" />
                  <span>
                    {wasExistingFigure
                      ? 'Figure updated in this cell (Discard restores previous figure)'
                      : 'Interactive figure inserted into this cell'}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5 text-emerald-600" />
                  <span>AI result ready in this cell</span>
                </>
              )}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => acceptCellAITask(editor)}
                className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-700"
              >
                <Check className="size-3.5" />
                Accept
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => discardCellAITask(editor)}
                className="flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 font-medium text-foreground hover:bg-accent"
              >
                <X className="size-3.5" />
                Discard
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => retryCellAITask(editor)}
                className="flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <CornerUpLeft className="size-3.5" />
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {task.status === 'error' && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50/95 px-3 py-2 text-xs text-red-700 shadow-lg">
          <span className="truncate">{task.error || 'AI request failed.'}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => retryCellAITask(editor)}
              className="flex items-center gap-1 rounded-md border border-red-300 bg-background px-2 py-1 font-medium text-foreground hover:bg-accent"
            >
              <CornerUpLeft className="size-3" />
              Retry
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => discardCellAITask(editor)}
              className="flex items-center gap-1 rounded-md border border-red-300 bg-background px-2 py-1 text-muted-foreground hover:bg-accent"
            >
              <X className="size-3" />
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

export function AIMenu() {
  const { api, editor } = useEditorPlugin(AIChatPlugin);
  const open = usePluginOption(AIChatPlugin, 'open');
  const task = useAITask();
  const [value, setValue] = React.useState('');
  const [input, setInput] = React.useState('');
  const [attachments, setAttachments] = React.useState<AIAttachment[]>([]);
  const [anchorElement, setAnchorElement] = React.useState<HTMLElement | null>(
    null
  );
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const selectedBlocks = getActiveMenuTargetBlocks(editor);
  const firstSelectedNode = selectedBlocks[0]?.[0] as any;
  const isFigureSelected =
    selectedBlocks.length === 1 &&
    (firstSelectedNode?.type === 'figure' ||
      (firstSelectedNode?.type === KEYS.columnGroup &&
        extractFiguresFromNode(firstSelectedNode).length > 0));

  const setOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      api.aiChat.show();
    } else {
      aiTaskStore.set({ menuTargetId: null });
      editor.setOption(AIChatPlugin, 'open', false);
    }
  };

  const show = (anchorEl: HTMLElement) => {
    setAnchorElement(anchorEl);
    editor.setOption(AIChatPlugin, 'open', true);
  };

  React.useEffect(() => {
    if (!open) return;

    const menuEntry = findBlockById(editor, task.menuTargetId);
    const blocks = menuEntry
      ? [menuEntry]
      : editor.getApi(BlockSelectionPlugin).blockSelection.getNodes({
          sort: true,
        });
    const targetNode =
      blocks.at(-1)?.[0] ??
      editor.api.block({ highest: true })?.[0] ??
      editor.api.block({
        at: [Math.max(0, editor.children.length - 1)],
        highest: true,
      })?.[0];

    let targetDom: HTMLElement | undefined;
    if (targetNode) {
      targetDom = editor.api.toDOMNode(targetNode);
      if (targetDom) {
        setAnchorElement(targetDom);
        targetDom.classList.add('ai-cell-menu-target');
      }
    }

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);

    return () => {
      window.clearTimeout(focusTimer);
      targetDom?.classList.remove('ai-cell-menu-target');
    };
  }, [editor, open, task.menuTargetId]);

  useEditorChat({
    onOpenBlockSelection: (blocks: NodeEntry[]) => {
      const last = blocks.at(-1);
      if (!last) return;
      const dom = editor.api.toDOMNode(last[0]);
      if (dom) show(dom);
    },
    onOpenChange: (isOpen) => {
      if (!isOpen) {
        setAnchorElement(null);
        setInput('');
        setAttachments([]);
      }
    },
    onOpenCursor: () => {
      const menuEntry = findBlockById(
        editor,
        aiTaskStore.get().menuTargetId
      );
      if (menuEntry) {
        const dom = editor.api.toDOMNode(menuEntry[0]);
        if (dom) show(dom);
        return;
      }

      const entry =
        editor.api.block({ highest: true }) ??
        editor.api.block({
          at: [Math.max(0, editor.children.length - 1)],
          highest: true,
        });
      if (!entry) return;
      const [ancestor, path] = entry;

      if (!editor.selection) {
        editor.tf.select(path);
      }

      const dom = editor.api.toDOMNode(ancestor);
      if (dom) show(dom);
    },
    onOpenSelection: () => {
      const last = editor.api.blocks().at(-1);
      if (!last) return;
      const dom = editor.api.toDOMNode(last[0]);
      if (dom) show(dom);
    },
  });

  return (
    <>
      <AICellOverlay editor={editor} />

      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverAnchor virtualRef={{ current: anchorElement! }} />

        <PopoverContent
          className="border-none bg-transparent p-0 shadow-none"
          style={{
            width: Math.max(320, anchorElement?.offsetWidth ?? 420),
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            setOpen(false);
          }}
          align="center"
          side="bottom"
        >
          <Command
            className="w-full rounded-lg border bg-popover shadow-md"
            value={value}
            onValueChange={setValue}
            shouldFilter={false}
          >
            {attachments.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-2.5 py-1.5">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="relative flex items-center gap-1.5 rounded border bg-background p-1 pr-5 text-xs"
                  >
                    {att.kind === 'image' && att.dataUrl ? (
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        className="size-8 rounded object-cover"
                      />
                    ) : (
                      <FileText className="size-3.5 shrink-0 text-blue-600" />
                    )}
                    <span className="max-w-[120px] truncate text-[11px] font-medium">
                      {att.name}
                    </span>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() =>
                        setAttachments((prev) =>
                          prev.filter((x) => x.id !== att.id)
                        )
                      }
                      className="absolute top-0.5 right-0.5 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center border-b px-2">
              <button
                type="button"
                aria-label="Attach reference image or file"
                title="Attach reference image or file (or paste image with Ctrl+V)"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Paperclip className="size-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                accept="image/*,.csv,.tsv,.json,.xlsx,.xls,.txt,.md,.py,.js,.ts,.tex"
                onChange={async (e) => {
                  const added = await readFileListAttachments(e.target.files);
                  if (added.length > 0) {
                    setAttachments((prev) => [...prev, ...added]);
                    setValue('__custom_prompt__');
                  }
                  e.target.value = '';
                }}
              />

              <CommandPrimitive.Input
                ref={inputRef}
                className={cn(
                  'flex h-9 w-full min-w-0 bg-transparent px-1.5 py-1 text-base outline-none transition-[color,box-shadow] placeholder:text-muted-foreground md:text-sm dark:bg-input/30',
                  'focus-visible:ring-transparent'
                )}
                value={input}
                onPaste={async (e) => {
                  const pasted = await readClipboardAttachments(
                    e.clipboardData
                  );
                  if (pasted.length > 0) {
                    setAttachments((prev) => [...prev, ...pasted]);
                    setValue('__custom_prompt__');
                  }
                }}
                onKeyDown={(e) => {
                  if (
                    isHotkey('backspace')(e) &&
                    input.length === 0 &&
                    attachments.length === 0
                  ) {
                    e.preventDefault();
                    setOpen(false);
                    return;
                  }
                  if (isHotkey('enter')(e) && !e.shiftKey) {
                    if (
                      (input.trim().length > 0 || attachments.length > 0) &&
                      (!value || value === '__custom_prompt__')
                    ) {
                      e.preventDefault();
                      e.stopPropagation();
                      submitCustomInput(editor, input, attachments);
                      setInput('');
                      setAttachments([]);
                    }
                  }
                }}
                onValueChange={(v) => {
                  setInput(v);
                  if (v.trim().length > 0 || attachments.length > 0) {
                    setValue('__custom_prompt__');
                  }
                }}
                placeholder={
                  isFigureSelected
                    ? 'Ask AI to edit figure, paste image (Ctrl+V), or attach reference…'
                    : 'Ask AI on this cell, paste image (Ctrl+V), or attach reference file…'
                }
                data-plate-focus
                autoFocus
              />
              {(input.trim().length > 0 || attachments.length > 0) && (
                <button
                  type="button"
                  aria-label="Send AI prompt"
                  data-tip="Run AI on this cell (Enter)"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    submitCustomInput(editor, input, attachments);
                    setInput('');
                    setAttachments([]);
                  }}
                  className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  <ArrowUp className="size-3.5" />
                </button>
              )}
            </div>

            <CommandList>
              <AIMenuItems
                attachments={attachments}
                input={input}
                setAttachments={setAttachments}
                setInput={setInput}
                setValue={setValue}
              />
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}

type EditorChatState = 'cursorCommand' | 'selectionCommand' | 'figureCommand';

const AICommentIcon = () => (
  <svg
    fill="none"
    height="24"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M0 0h24v24H0z" fill="none" stroke="none" />
    <path d="M8 9h8" />
    <path d="M8 13h4.5" />
    <path d="M10 19l-1 -1h-3a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v4.5" />
    <path d="M17.8 20.817l-2.172 1.138a.392 .392 0 0 1 -.568 -.41l.415 -2.411l-1.757 -1.707a.389 .389 0 0 1 .217 -.665l2.428 -.352l1.086 -2.193a.392 .392 0 0 1 .702 0l1.086 2.193l2.428 .352a.39 .39 0 0 1 .217 .665l-1.757 1.707l.414 2.41a.39 .39 0 0 1 -.567 .411l-2.172 -1.138z" />
  </svg>
);

const aiChatItems = {
  addPythonCode: {
    icon: <Code2 />,
    label: 'Add / update Python verification code',
    value: 'addPythonCode',
    onSelect: ({ editor, input }) => {
      startCellAITask(editor, {
        input,
        label: 'Add / update Python verification code',
        mode: 'insert',
        prompt:
          input.trim() ||
          'Write or update the "python" verification script for this figure so it computes the exact same summary value (`result = ...`) as `expose(...)` in the JS code using the same dataset and parameter variables. Keep "caption", "params", and "js" consistent.',
        toolName: 'generate',
      });
    },
  },
  comment: {
    icon: <AICommentIcon />,
    label: 'Comment',
    value: 'comment',
    onSelect: ({ editor, input }) => {
      aiTaskStore.set({ menuTargetId: null });
      editor.setOption(AIChatPlugin, 'open', false);
      editor.getApi(AIChatPlugin).aiChat.submit(input, {
        mode: 'insert',
        prompt:
          'Please comment on the following content and provide reasonable and meaningful feedback.',
        toolName: 'comment',
      });
    },
  },
  continueWrite: {
    icon: <PenLine />,
    label: 'Continue writing',
    value: 'continueWrite',
    onSelect: ({ editor, input }) => {
      const targetBlocks = getActiveMenuTargetBlocks(editor);
      const ancestorNode =
        targetBlocks[0] ?? editor.api.block({ highest: true });
      const isEmpty = ancestorNode
        ? NodeApi.string(ancestorNode[0]).trim().length === 0
        : true;

      startCellAITask(editor, {
        input,
        insertBelow: !isEmpty,
        label: 'Continue writing',
        mode: 'insert',
        prompt: isEmpty
          ? `<Document>\n{editor}\n</Document>\nStart writing a new paragraph AFTER <Document> ONLY ONE SENTENCE`
          : 'Continue writing AFTER <Block> ONLY ONE SENTENCE. DONT REPEAT THE TEXT.',
        toolName: 'generate',
      });
    },
  },
  createEquation: {
    icon: <RadicalIcon />,
    label: 'Write math formula',
    value: 'createEquation',
    onSelect: ({ editor, input }) => {
      startCellAITask(editor, {
        input,
        label: input.trim()
          ? `Write formula: ${input.trim()}`
          : 'Write math formula',
        mode: 'insert',
        prompt: wrapEquationPrompt(input),
        toolName: 'generate',
      });
    },
  },
  createFigure: {
    icon: <ChartColumn />,
    label: 'Create figure from data',
    value: 'createFigure',
    onSelect: ({ editor, input }) => {
      startCellAITask(editor, {
        input,
        label: input.trim()
          ? `Create figure: ${input.trim()}`
          : 'Create figure from data',
        mode: 'insert',
        prompt: wrapFigurePrompt(input),
        toolName: 'generate',
      });
    },
  },
  emojify: {
    icon: <SmileIcon />,
    label: 'Emojify',
    value: 'emojify',
    onSelect: ({ editor, input }) => {
      startCellAITask(editor, {
        input,
        label: 'Emojify',
        mode: 'chat',
        prompt:
          'Add a small number of contextually relevant emojis within each block only. You may insert emojis, but do not remove, replace, or rewrite existing text, and do not modify Markdown syntax, links, or line breaks.',
        toolName: 'edit',
      });
    },
  },
  explain: {
    icon: <BadgeHelp />,
    label: 'Explain',
    value: 'explain',
    onSelect: ({ editor, input }) => {
      startCellAITask(editor, {
        input,
        insertBelow: true,
        label: 'Explain',
        mode: 'insert',
        prompt: {
          default: 'Explain {editor}',
          selecting: 'Explain',
        },
        toolName: 'generate',
      });
    },
  },
  explainFigureBelow: {
    icon: <BadgeHelp />,
    label: 'Explain this figure below',
    value: 'explainFigureBelow',
    onSelect: ({ editor, input }) => {
      startCellAITask(editor, {
        input,
        insertBelow: true,
        label: 'Explain this figure below',
        mode: 'insert',
        prompt:
          input.trim() ||
          'Write a concise, insightful scientific paragraph explaining what this figure shows, its key patterns, and how readers can use its interactive parameters. Output Markdown prose only.',
        toolName: 'generate',
      });
    },
  },
  fixSpelling: {
    icon: <Check />,
    label: 'Fix spelling & grammar',
    value: 'fixSpelling',
    onSelect: ({ editor, input }) => {
      startCellAITask(editor, {
        input,
        label: 'Fix spelling & grammar',
        mode: 'chat',
        prompt:
          'Fix spelling, grammar, and punctuation errors within each block only, without changing meaning, tone, or adding new information.',
        toolName: 'edit',
      });
    },
  },
  improveFigureCaption: {
    icon: <PenLine />,
    label: 'Improve figure caption',
    value: 'improveFigureCaption',
    onSelect: ({ editor, input }) => {
      startCellAITask(editor, {
        input,
        label: 'Improve figure caption',
        mode: 'insert',
        prompt:
          input.trim() ||
          'Rewrite "caption" to be a clear, informative scientific figure caption describing the chart and its variables. Keep "params", "js", and "python" unchanged.',
        toolName: 'generate',
      });
    },
  },
  improveWriting: {
    icon: <Wand />,
    label: 'Improve writing',
    value: 'improveWriting',
    onSelect: ({ editor, input }) => {
      startCellAITask(editor, {
        input,
        label: 'Improve writing',
        mode: 'chat',
        prompt:
          'Improve the writing for clarity and flow, without changing meaning or adding new information.',
        toolName: 'edit',
      });
    },
  },
  makeLonger: {
    icon: <ListPlus />,
    label: 'Make longer',
    value: 'makeLonger',
    onSelect: ({ editor, input }) => {
      startCellAITask(editor, {
        input,
        label: 'Make longer',
        mode: 'chat',
        prompt:
          'Make the content longer by elaborating on existing ideas within each block only, without changing meaning or adding new information.',
        toolName: 'edit',
      });
    },
  },
  makeShorter: {
    icon: <ListMinus />,
    label: 'Make shorter',
    value: 'makeShorter',
    onSelect: ({ editor, input }) => {
      startCellAITask(editor, {
        input,
        label: 'Make shorter',
        mode: 'chat',
        prompt:
          'Make the content shorter by reducing verbosity within each block only, without changing meaning or removing essential information.',
        toolName: 'edit',
      });
    },
  },
  modifyFigure: {
    icon: <Wand />,
    label: 'Improve figure & interactive controls',
    value: 'modifyFigure',
    onSelect: ({ editor, input }) => {
      startCellAITask(editor, {
        input,
        label: input.trim()
          ? `Edit figure: ${input.trim()}`
          : 'Improve figure & interactive controls',
        mode: 'insert',
        prompt:
          input.trim() ||
          'Enhance this figure card: improve the Observable Plot visual styling, tooltips, axis labels, and ensure it has 1–2 useful interactive controls in "params" plus matching "python" verification code.',
        toolName: 'generate',
      });
    },
  },
  simplifyLanguage: {
    icon: <FeatherIcon />,
    label: 'Simplify language',
    value: 'simplifyLanguage',
    onSelect: ({ editor, input }) => {
      startCellAITask(editor, {
        input,
        label: 'Simplify language',
        mode: 'chat',
        prompt:
          'Simplify the language by using clearer and more straightforward wording within each block only, without changing meaning or adding new information.',
        toolName: 'edit',
      });
    },
  },
  summarize: {
    icon: <Album />,
    label: 'Add a summary',
    value: 'summarize',
    onSelect: ({ editor, input }) => {
      startCellAITask(editor, {
        input,
        insertBelow: true,
        label: 'Add a summary',
        mode: 'insert',
        prompt: {
          default: 'Summarize {editor}',
          selecting: 'Summarize',
        },
        toolName: 'generate',
      });
    },
  },
} satisfies Record<
  string,
  {
    icon: React.ReactNode;
    label: string;
    value: string;
    onSelect?: ({
      aiEditor,
      editor,
      input,
    }: {
      aiEditor: SlateEditor;
      editor: PlateEditor;
      input: string;
    }) => void;
  }
>;

const menuStateItems: Record<
  EditorChatState,
  {
    items: (typeof aiChatItems)[keyof typeof aiChatItems][];
    heading?: string;
  }[]
> = {
  cursorCommand: [
    {
      items: [
        aiChatItems.createFigure,
        aiChatItems.createEquation,
        aiChatItems.continueWrite,
        aiChatItems.summarize,
        aiChatItems.explain,
        aiChatItems.improveWriting,
        aiChatItems.fixSpelling,
        aiChatItems.comment,
      ],
    },
  ],
  figureCommand: [
    {
      heading: 'Figure AI actions',
      items: [
        aiChatItems.modifyFigure,
        aiChatItems.addPythonCode,
        aiChatItems.improveFigureCaption,
        aiChatItems.explainFigureBelow,
      ],
    },
  ],
  selectionCommand: [
    {
      items: [
        aiChatItems.improveWriting,
        aiChatItems.fixSpelling,
        aiChatItems.makeShorter,
        aiChatItems.makeLonger,
        aiChatItems.simplifyLanguage,
        aiChatItems.emojify,
        aiChatItems.createFigure,
        aiChatItems.comment,
      ],
    },
  ],
};

export const AIMenuItems = ({
  attachments = [],
  input,
  setAttachments,
  setInput,
  setValue,
}: {
  attachments?: AIAttachment[];
  input: string;
  setAttachments?: (value: AIAttachment[]) => void;
  setInput: (value: string) => void;
  setValue: (value: string) => void;
}) => {
  const editor = useEditorRef();
  const aiEditor = usePluginOption(AIChatPlugin, 'aiEditor')!;
  const isSelecting = useIsSelecting();
  const task = useAITask();
  const selectedBlocks = React.useMemo(
    () => getActiveMenuTargetBlocks(editor),
    [editor, task.menuTargetId]
  );
  const firstNode = selectedBlocks[0]?.[0] as any;
  const isFigureSelected =
    selectedBlocks.length === 1 &&
    (firstNode?.type === 'figure' ||
      (firstNode?.type === KEYS.columnGroup &&
        extractFiguresFromNode(firstNode).length > 0));
  const hasTargetBlock =
    selectedBlocks.length > 0 &&
    (firstNode?.type === KEYS.equation ||
      firstNode?.type === KEYS.columnGroup ||
      !editor.api.isEmpty(firstNode));

  const menuState: EditorChatState = isFigureSelected
    ? 'figureCommand'
    : isSelecting || hasTargetBlock
      ? 'selectionCommand'
      : 'cursorCommand';

  const menuGroups = React.useMemo(() => {
    const groups = menuStateItems[menuState];
    const q = input.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((item) =>
          item.label.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [input, menuState]);

  React.useEffect(() => {
    if (input.trim().length > 0 || attachments.length > 0) {
      setValue('__custom_prompt__');
      return;
    }
    if (menuGroups.length > 0 && menuGroups[0].items.length > 0) {
      setValue(menuGroups[0].items[0].value);
    }
  }, [attachments.length, input, menuGroups, setValue]);

  return (
    <>
      {(input.trim().length > 0 || attachments.length > 0) && (
        <CommandGroup heading="Custom request">
          <CommandItem
            value="__custom_prompt__"
            className="[&_svg]:text-blue-600 font-medium"
            onSelect={() => {
              submitCustomInput(editor, input, attachments);
              setInput('');
              setAttachments?.([]);
            }}
          >
            {isFigureSelected || isFigurePrompt(input) ? (
              <ChartColumn />
            ) : (
              <Sparkles />
            )}
            <span>
              {isFigureSelected
                ? `Modify figure: "${input.trim() || `${attachments.length} attachment(s)`}"`
                : isFigurePrompt(input)
                  ? `Create figure: "${input.trim() || `${attachments.length} attachment(s)`}"`
                  : `Run AI on this cell: "${input.trim() || `${attachments.length} attachment(s)`}"`}
            </span>
          </CommandItem>
        </CommandGroup>
      )}
      {menuGroups.map((group, index) => (
        <CommandGroup key={index} heading={group.heading}>
          {group.items.map((menuItem) => (
            <CommandItem
              key={menuItem.value}
              className="[&_svg]:text-muted-foreground"
              value={menuItem.value}
              onSelect={() => {
                const enrichedInput = buildPromptWithAttachments(
                  input,
                  attachments,
                  { embedImageTag: true }
                );
                menuItem.onSelect?.({
                  aiEditor,
                  editor,
                  input: enrichedInput,
                });
                setInput('');
                setAttachments?.([]);
              }}
            >
              {menuItem.icon}
              <span>{menuItem.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </>
  );
};

export function AILoadingBar() {
  const editor = useEditorRef();
  const toolName = usePluginOption(AIChatPlugin, 'toolName');
  const chat = usePluginOption(AIChatPlugin, 'chat');
  const { status } = chat;
  const { api } = useEditorPlugin(AIChatPlugin);
  const isLoading = status === 'streaming' || status === 'submitted';

  const handleComments = (type: 'accept' | 'reject') => {
    if (type === 'accept') {
      editor.tf.unsetNodes([getTransientCommentKey()], {
        at: [],
        match: (n) => TextApi.isText(n) && !!n[KEYS.comment],
      });
    }

    if (type === 'reject') {
      editor
        .getTransforms(commentPlugin)
        .comment.unsetMark({ transient: true });
    }

    api.aiChat.hide();
  };

  useHotkeys('esc', () => {
    if (isLoading) {
      stopCellAITask(editor);
    }
  });

  if (toolName === 'comment' && status === 'ready') {
    return (
      <div
        className={cn(
          '-translate-x-1/2 absolute bottom-4 left-1/2 z-50 flex flex-col items-center gap-0 rounded-xl border border-border/50 bg-popover p-1 text-muted-foreground text-sm shadow-xl backdrop-blur-sm',
          'p-3'
        )}
      >
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-5">
            <Button
              size="sm"
              disabled={isLoading}
              onClick={() => handleComments('accept')}
            >
              Accept
            </Button>

            <Button
              size="sm"
              disabled={isLoading}
              onClick={() => handleComments('reject')}
            >
              Reject
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
