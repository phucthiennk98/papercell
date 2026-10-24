'use client';

import * as React from 'react';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';

import { AIChatPlugin } from '@platejs/ai/react';
import { insertInlineEquation } from '@platejs/math';
import { RadicalIcon, SparklesIcon, SuperscriptIcon } from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorRef } from 'platejs/react';

import { aiTaskStore } from '@/ai/ai-task-store';
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
      tooltip="Mark as equation"
    >
      <RadicalIcon />
    </ToolbarButton>
  );
}

function insertEquationNode(editor: any, texExpression: string): string {
  const id = `eq-${newId()}`;
  const node = {
    type: KEYS.equation,
    id,
    texExpression,
    children: [{ text: '' }],
  };
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
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Create or generate with AI
        </DropdownMenuLabel>

        <DropdownMenuItem
          className="items-start gap-2.5 py-1.5"
          onSelect={() => {
            const id = insertEquationNode(
              editor,
              String.raw`f(x) = \frac{\square}{\square}`
            );
            window.setTimeout(() => {
              aiTaskStore.set({ menuTargetId: id });
              editor.getApi(AIChatPlugin).aiChat.show();
            }, 30);
          }}
        >
          <SparklesIcon className="mt-0.5 size-4 shrink-0 text-blue-600" />
          <span className="flex flex-col">
            <span className="font-medium text-blue-600">
              Ask AI to write a formula…
            </span>
            <span className="text-xs text-muted-foreground">
              Describe the equation in plain language; click any number after to
              edit
            </span>
          </span>
        </DropdownMenuItem>

        <div className="grid grid-cols-2 gap-1 px-1 py-1">
          <DropdownMenuItem
            className="gap-2 py-1.5 text-xs"
            onSelect={() => {
              insertEquationNode(
                editor,
                String.raw`y = \frac{\square}{\square}`
              );
              editor.tf.focus();
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
