'use client';

import * as React from 'react';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';

import { AIChatPlugin } from '@platejs/ai/react';
import { insertInlineEquation } from '@platejs/math';
import {
  ArrowUpIcon,
  RadicalIcon,
  SparklesIcon,
  SuperscriptIcon,
} from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorRef } from 'platejs/react';

import { aiTaskStore } from '@/ai/ai-task-store';
import { wrapEquationPrompt } from '@/ai/figure-nodes';
import { startCellAITask } from '@/components/editor/plugins/ai-kit';
import { insertInlineElement } from '@/components/editor/transforms';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  FORMULA_TEMPLATES,
  type FormulaTemplateItem,
  renderMiniKatex,
} from '@/components/ui/equation-visual';
import { newId } from '@/editor/types';

import { ToolbarButton } from './toolbar';

export function InlineEquationToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>
) {
  const editor = useEditorRef();

  return (
    <ToolbarButton
      {...props}
      onClick={() => {
        insertInlineEquation(editor);
      }}
      tooltip="Insert inline formula"
    >
      <RadicalIcon />
    </ToolbarButton>
  );
}

export function insertEquationNode(
  editor: any,
  texExpression: string,
  options?: { autoOpen?: boolean }
): string {
  const id = `eq-${newId()}`;
  const node: Record<string, unknown> = {
    type: KEYS.equation,
    id,
    texExpression,
    children: [{ text: '' }],
  };
  if (options?.autoOpen) {
    node.autoOpen = true;
  }
  const block = editor.api.block();
  const emptyPara =
    block && block[0].type === 'p' && editor.api.isEmpty(block[0]);
  if (emptyPara) {
    editor.tf.replaceNodes(node, { at: block[1] });
  } else {
    editor.tf.insertNodes(node, { select: true });
  }
  return id;
}

const CATEGORIES: FormulaTemplateItem['category'][] = [
  'Probability & Statistics',
  'Calculus & Analysis',
  'Modeling & Metrics',
];

export function EquationToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const [aiPrompt, setAiPrompt] = React.useState('');
  const promptInputRef = React.useRef<HTMLInputElement | null>(null);

  const runFormulaAI = () => {
    const clean = aiPrompt.trim();
    const id = insertEquationNode(
      editor,
      String.raw`f(x) = \frac{\square}{\square}`
    );
    setOpen(false);
    setAiPrompt('');

    if (clean) {
      window.setTimeout(() => {
        aiTaskStore.set({ menuTargetId: id });
        startCellAITask(editor, {
          input: clean,
          label: `Write formula: ${clean}`,
          mode: 'insert',
          prompt: wrapEquationPrompt(clean),
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
          tooltip="Add a math formula (templates, interactive visual editor, or AI)"
          aria-label="Add formula"
          isDropdown
        >
          <RadicalIcon />
          <span className="ml-1 hidden xl:inline">Formula</span>
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="max-h-[min(80vh,640px)] w-[400px] overflow-y-auto"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Create or generate with AI
        </DropdownMenuLabel>

        <div
          className="mx-1 mb-1 rounded-lg border border-blue-200/80 bg-blue-50/40 p-2.5 transition-colors hover:border-blue-300"
          onClick={() => promptInputRef.current?.focus()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-2">
            <SparklesIcon className="mt-0.5 size-4 shrink-0 text-blue-600" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-blue-700">
                Ask AI to write a formula…
              </div>
              <div className="text-[11px] text-muted-foreground">
                Describe the equation in plain language; click any number after
                to edit
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
                  runFormulaAI();
                }
              }}
              placeholder="e.g. Bayes theorem or exponential PDF with μ…"
              className="h-8 min-w-0 flex-1 rounded-md border border-blue-200 bg-white px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                runFormulaAI();
              }}
              title={
                aiPrompt.trim()
                  ? 'Generate formula with AI (Enter)'
                  : 'Insert formula & open cell AI box'
              }
              className="flex size-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white transition-colors hover:bg-blue-700"
            >
              <ArrowUpIcon className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 px-1 py-1">
          <DropdownMenuItem
            className="gap-2 py-1.5 text-xs"
            onSelect={() => {
              insertEquationNode(
                editor,
                String.raw`y = \frac{\square}{\square}`,
                { autoOpen: true }
              );
            }}
          >
            <RadicalIcon className="size-4 shrink-0" />
            <span>Blank block formula</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="gap-2 py-1.5 text-xs"
            onSelect={() => {
              insertInlineElement(editor, KEYS.inlineEquation);
              editor.tf.focus();
            }}
          >
            <SuperscriptIcon className="size-4 shrink-0" />
            <span>Inline formula (in text)</span>
          </DropdownMenuItem>
        </div>

        {CATEGORIES.map((category) => (
          <React.Fragment key={category}>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {category}
            </DropdownMenuLabel>
            {FORMULA_TEMPLATES.filter((t) => t.category === category).map(
              (tpl) => (
                <DropdownMenuItem
                  key={tpl.id}
                  className="flex items-center justify-between gap-3 py-1.5"
                  onSelect={() => {
                    insertEquationNode(editor, tpl.latex);
                    editor.tf.focus();
                  }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-xs">
                      {tpl.label}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {tpl.hint}
                    </span>
                  </span>
                  <span
                    className="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 text-xs"
                    dangerouslySetInnerHTML={{
                      __html: renderMiniKatex(tpl.latex),
                    }}
                  />
                </DropdownMenuItem>
              )
            )}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
