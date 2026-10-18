'use client';

import * as React from 'react';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';

import { ChartColumnIcon } from 'lucide-react';
import { useEditorRef } from 'platejs/react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CHART_TYPES } from '@/figure/builder';
import { FIGURE_TEMPLATES, insertChart, insertFigure } from '@/figure/templates';

import { ToolbarButton } from './toolbar';

/** Nút "Hình": chọn loại biểu đồ (rồi chọn cột ở tab Thiết kế) hoặc một mẫu có code sẵn. */
export function FigureToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip="Add a figure (chart, map, table)" aria-label="Add figure" isDropdown>
          <ChartColumnIcon />
          <span className="ml-1 hidden xl:inline">Figure</span>
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="max-h-[min(80vh,640px)] w-[380px] overflow-y-auto" align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">From the document's data: pick a type, then columns, no code</DropdownMenuLabel>
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
        <DropdownMenuLabel className="text-xs text-muted-foreground">Code templates (sample data, with sliders)</DropdownMenuLabel>
        {FIGURE_TEMPLATES.filter((t) => t.id !== 'data' && !t.id.startsWith('controls-')).map((t) => (
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
        <DropdownMenuLabel className="text-xs text-muted-foreground">With reader controls (dropdown, radio buttons, switch)</DropdownMenuLabel>
        {FIGURE_TEMPLATES.filter((t) => t.id.startsWith('controls-')).map((t) => (
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
