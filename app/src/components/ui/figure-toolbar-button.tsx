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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FIGURE_TEMPLATES, insertFigure } from '@/figure/templates';

import { ToolbarButton } from './toolbar';

/** Nút "Thêm hình": chọn một mẫu biểu đồ JS để chèn vào bài. */
export function FigureToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip="Thêm hình (biểu đồ JS)" aria-label="Thêm hình" isDropdown>
          <ChartColumnIcon />
          <span className="ml-1 hidden xl:inline">Hình</span>
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-[280px]" align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Chèn hình từ mẫu</DropdownMenuLabel>
        {FIGURE_TEMPLATES.map((t) => (
          <DropdownMenuItem
            key={t.id}
            className="items-start gap-3 py-2"
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
