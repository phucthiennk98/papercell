'use client';

import * as React from 'react';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';

import { AIChatPlugin } from '@platejs/ai/react';
import { ArrowUpIcon, ChartColumnIcon, SparklesIcon } from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorRef } from 'platejs/react';

import { aiTaskStore } from '@/ai/ai-task-store';
import { wrapFigurePrompt } from '@/ai/figure-nodes';
import { startCellAITask } from '@/components/editor/plugins/ai-kit';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { newId } from '@/editor/types';
import { CHART_TYPES } from '@/figure/builder';
import { FIGURE_TEMPLATES, insertChart, insertFigure } from '@/figure/templates';

import { ToolbarButton } from './toolbar';

function ensureTargetBlockForFigureAI(editor: any): string {
  const block = editor.api.block();
  if (block && block[0].type === KEYS.p && editor.api.isEmpty(block[0])) {
    const existingId = (block[0].id as string) || `p-${newId()}`;
    if (!block[0].id) {
      editor.tf.setNodes({ id: existingId }, { at: block[1] });
    }
    return existingId;
  }
  const id = `p-${newId()}`;
  const node = {
    type: KEYS.p,
    id,
    children: [{ text: '' }],
  };
  editor.tf.insertNodes(node, { select: true });
  return id;
}

/** Nút "Hình": tạo biểu đồ bằng AI, chọn loại biểu đồ từ dữ liệu hoặc chọn mẫu có code sẵn. */
export function FigureToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const [aiPrompt, setAiPrompt] = React.useState('');
  const promptInputRef = React.useRef<HTMLInputElement | null>(null);

  const runFigureAI = () => {
    const clean = aiPrompt.trim();
    const id = ensureTargetBlockForFigureAI(editor);
    setOpen(false);
    setAiPrompt('');

    if (clean) {
      window.setTimeout(() => {
        aiTaskStore.set({ menuTargetId: id });
        startCellAITask(editor, {
          input: clean,
          label: `Create figure: ${clean}`,
          mode: 'insert',
          prompt: wrapFigurePrompt(clean),
          toolName: 'generate',
        });
      }, 30);
    } else {
      window.setTimeout(() => {
        aiTaskStore.set({ menuTargetId: id });
        editor.setOption(AIChatPlugin, 'open', false);
        window.requestAnimationFrame(() => {
          editor.setOption(AIChatPlugin, 'open', true);
        });
      }, 40);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          pressed={open}
          tooltip="Add a figure (AI, chart from data, map, table, or code template)"
          aria-label="Add figure"
          isDropdown
        >
          <ChartColumnIcon />
          <span className="ml-1 hidden xl:inline">Figure</span>
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="max-h-[min(80vh,640px)] w-[min(390px,calc(100vw-16px))] overflow-y-auto"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Create or generate with AI
        </DropdownMenuLabel>

        <div
          className="mx-1 mb-1.5 rounded-lg border border-blue-200/80 bg-blue-50/40 p-2.5 transition-colors hover:border-blue-300"
          onClick={() => promptInputRef.current?.focus()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-2">
            <SparklesIcon className="mt-0.5 size-4 shrink-0 text-blue-600" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-blue-700">
                Ask AI to create a figure…
              </div>
              <div className="text-[11px] text-muted-foreground">
                Describe the chart, simulation, or dataset; includes interactive
                sliders &amp; Python verification
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1.5">
            <input
              ref={promptInputRef}
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runFigureAI();
                }
              }}
              placeholder="e.g. Scatter plot with regression line and slider…"
              className="h-8 min-w-0 flex-1 rounded-md border border-blue-200 bg-white px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                runFigureAI();
              }}
              title={
                aiPrompt.trim()
                  ? 'Generate figure with AI (Enter)'
                  : 'Insert cell & open full AI box'
              }
              className="flex size-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white transition-colors hover:bg-blue-700"
            >
              <ArrowUpIcon className="size-3.5" />
            </button>
          </div>
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          From the document&apos;s data: pick a type, then columns, no code
        </DropdownMenuLabel>
        <div className="grid grid-cols-4 gap-1 px-1 pb-1">
          {CHART_TYPES.map((c) => (
            <DropdownMenuItem
              key={c.type}
              className="flex-col gap-1 px-1 py-2 text-center text-xs"
              onSelect={() => {
                insertChart(editor, c.type);
                editor.tf.focus();
              }}
            >
              <c.icon className="size-5" />
              <span className="leading-tight">{c.label}</span>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Code templates (sample data, with sliders)
        </DropdownMenuLabel>
        {FIGURE_TEMPLATES.filter(
          (t) => t.id !== 'data' && !t.id.startsWith('controls-')
        ).map((t) => (
          <DropdownMenuItem
            key={t.id}
            className="items-start gap-3 py-1.5"
            onSelect={() => {
              insertFigure(editor, t.id);
              editor.tf.focus();
            }}
          >
            <t.icon className="mt-0.5 size-4 shrink-0" />
            <span className="flex flex-col">
              <span className="font-medium">{t.label}</span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          With reader controls (dropdown, radio buttons, switch)
        </DropdownMenuLabel>
        {FIGURE_TEMPLATES.filter((t) => t.id.startsWith('controls-')).map(
          (t) => (
            <DropdownMenuItem
              key={t.id}
              className="items-start gap-3 py-1.5"
              onSelect={() => {
                insertFigure(editor, t.id);
                editor.tf.focus();
              }}
            >
              <t.icon className="mt-0.5 size-4 shrink-0" />
              <span className="flex flex-col">
                <span className="font-medium">{t.label}</span>
                <span className="text-xs text-muted-foreground">{t.hint}</span>
              </span>
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
