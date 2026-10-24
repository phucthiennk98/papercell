'use client';

import * as React from 'react';

import type { TColumnElement, TElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { DndPlugin, useDraggable, useDropLine } from '@platejs/dnd';
import { setColumns } from '@platejs/layout';
import { ResizableProvider } from '@platejs/resizable';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import { useComposedRef } from '@udecode/cn';
import { type LucideProps, Trash2Icon } from 'lucide-react';
import { GripHorizontal } from 'lucide-react';
import { PathApi } from 'platejs';
import { useDrop } from 'react-dnd';
import { moveToColumnGroupEdge, sideTarget } from '@/editor/side-drop';
import {
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useElement,
  useFocusedLast,
  usePluginOption,
  useReadOnly,
  useRemoveNodeButton,
  useSelected,
  withHOC,
} from 'platejs/react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const ColumnElement = withHOC(
  ResizableProvider,
  function ColumnElement(props: PlateElementProps<TColumnElement>) {
    const { width } = props.element;
    const readOnly = useReadOnly();
    const isSelectionAreaVisible = usePluginOption(
      BlockSelectionPlugin,
      'isSelectionAreaVisible'
    );

    const { isDragging, nodeRef, previewRef, handleRef } = useDraggable({
      element: props.element,
      orientation: 'horizontal',
      type: 'column',
      canDropNode: ({ dragEntry, dropEntry }) =>
        !!dragEntry &&
        PathApi.equals(
          PathApi.parent(dragEntry[1]),
          PathApi.parent(dropEntry[1])
        ),
    });

    const editor = useEditorRef();
    const wrapRef = React.useRef<HTMLDivElement>(null);
    const path = editor.api.findPath(props.element);
    const group = path ? editor.api.node(PathApi.parent(path))?.[0] as { children: unknown[] } | undefined : undefined;
    const isLast = !path || !group || path[path.length - 1] === group.children.length - 1;

    /** Drag the boundary with the next column; widths are committed once on release (one undo step). */
    const startResize = (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const me = wrapRef.current, next = me?.nextElementSibling as HTMLElement | null, row = me?.parentElement;
      if (!me || !next || !row || !path) return;
      const total = row.getBoundingClientRect().width;
      const a0 = me.getBoundingClientRect().width / total * 100, b0 = next.getBoundingClientRect().width / total * 100;
      const x0 = e.clientX;
      let a = a0, b = b0;
      const move = (ev: PointerEvent) => {
        const d = (ev.clientX - x0) / total * 100;
        a = Math.max(10, Math.min(a0 + b0 - 10, a0 + d)); b = a0 + b0 - a;
        me.style.width = `${a}%`; next.style.width = `${b}%`;
      };
      const up = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up);
        document.body.classList.remove('col-resizing');
        editor.tf.withoutNormalizing(() => {
          editor.tf.setNodes({ width: `${a.toFixed(1)}%` } as any, { at: path });
          editor.tf.setNodes({ width: `${b.toFixed(1)}%` } as any, { at: PathApi.next(path) });
        });
      };
      document.body.classList.add('col-resizing');
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    };

    return (
      <div ref={wrapRef} className="group/column relative max-sm:!w-full" style={{ width: width ?? '100%' }}>
        {!readOnly && !isLast && (
          <div
            className="col-resize-handle"
            contentEditable={false}
            role="separator"
            aria-orientation="vertical"
            aria-label="Drag to resize columns"
            title="Drag to resize columns"
            onPointerDown={startResize}
          />
        )}
        {!readOnly && !isSelectionAreaVisible && (
          <div
            ref={handleRef}
            className={cn(
              '-translate-x-1/2 -translate-y-1/2 absolute top-2 left-1/2 z-50',
              'pointer-events-auto flex items-center',
              'opacity-0 transition-opacity group-hover/column:opacity-100'
            )}
          >
            <ColumnDragHandle />
          </div>
        )}

        <PlateElement
          {...props}
          ref={useComposedRef(props.ref, previewRef, nodeRef)}
          className="h-full px-2 pt-2 group-first/column:pl-0 group-last/column:pr-0 max-sm:px-0"
        >
          <div
            className={cn(
              'relative h-full border border-transparent p-1.5',
              !readOnly && 'rounded-lg border-border border-dashed',
              isDragging && 'opacity-50'
            )}
          >
            {props.children}

            {!readOnly && !isSelectionAreaVisible && <DropLine />}
          </div>
        </PlateElement>
      </div>
    );
  }
);

const ColumnDragHandle = React.memo(function ColumnDragHandle() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            className="!px-1.5 h-5 cursor-grab rounded-md border border-border bg-background/95 shadow-2xs hover:bg-accent active:cursor-grabbing"
          >
            <GripHorizontal
              className="text-muted-foreground"
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
              }}
            />
          </Button>
        </TooltipTrigger>

        <TooltipContent>Drag to swap columns or move column out</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

function DropLine() {
  const { dropLine } = useDropLine({ orientation: 'horizontal' });

  if (!dropLine) return null;

  return (
    <div
      className={cn(
        'slate-dropLine',
        'absolute bg-brand/50',
        dropLine === 'left' &&
          'group-first/column:-left-1 inset-y-0 left-[-10.5px] w-1',
        dropLine === 'right' &&
          'group-last/column:-right-1 inset-y-0 right-[-11px] w-1'
      )}
    />
  );
}

export function ColumnGroupElement(props: PlateElementProps) {
  const readOnly = useReadOnly();
  return (
    <PlateElement className={cn('relative mb-2', !readOnly && 'px-2 pt-3 pb-2')} {...props}>
      {!readOnly && <ColumnGroupEdgeDrop element={props.element} edge="top" />}
      <ColumnFloatingToolbar>
        <div className="flex size-full flex-col rounded sm:flex-row">{props.children}</div>
      </ColumnFloatingToolbar>
      {!readOnly && <ColumnGroupEdgeDrop element={props.element} edge="bottom" />}
    </PlateElement>
  );
}

function ColumnGroupEdgeDrop({ element, edge }: { element: TElement; edge: 'top' | 'bottom' }) {
  const editor = useEditorRef();
  const isDragging = usePluginOption(DndPlugin, 'isDragging');
  const draggingId = usePluginOption(DndPlugin, 'draggingId');
  const ref = React.useRef<HTMLDivElement>(null);

  const isDraggingChild = React.useMemo(() => {
    if (!isDragging || !draggingId) return false;
    const groupPath = editor.api.findPath(element);
    if (!groupPath) return false;
    const ids = (Array.isArray(draggingId) ? draggingId : [draggingId]).filter(Boolean) as string[];
    if (!ids.length) return false;
    return ids.every((id) => {
      const entry = editor.api.node({ at: [], mode: 'all', match: (n: any) => n.id === id });
      return !!entry && PathApi.isAncestor(groupPath, entry[1]);
    });
  }, [editor, element, isDragging, draggingId]);

  const [{ isOver }, drop] = useDrop(
    () => ({
      accept: ['block', 'column'],
      canDrop: () => isDraggingChild,
      collect: (monitor) => ({ isOver: isDraggingChild && monitor.isOver({ shallow: true }) }),
      hover: () => {
        if (!isDraggingChild) return;
        sideTarget.set(null);
        editor.setOption(DndPlugin, 'dropTarget', { id: null, line: '' });
      },
      drop: (dragItem: { id?: string | string[] }) => {
        if (!isDraggingChild) return;
        sideTarget.set(null);
        const rawId = dragItem?.id ?? editor.getOption(DndPlugin, 'draggingId');
        const ids = (Array.isArray(rawId) ? rawId : rawId ? [rawId] : []).filter(Boolean) as string[];
        if (ids.length) {
          moveToColumnGroupEdge(editor, ids, element, edge);
        }
      },
    }),
    [editor, element, edge, isDraggingChild]
  );
  drop(ref);
  if (!isDraggingChild) return null;
  return (
    <div
      ref={ref}
      contentEditable={false}
      className={cn(
        'absolute inset-x-0 z-40',
        edge === 'top' ? '-top-2.5 h-5' : '-bottom-3.5 h-7'
      )}
    >
      {isOver && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 h-1 rounded-full bg-brand',
            edge === 'top' ? 'top-1' : 'bottom-1'
          )}
        />
      )}
    </div>
  );
}

function ColumnFloatingToolbar({ children }: React.PropsWithChildren) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const element = useElement<TColumnElement>();
  const { props: buttonProps } = useRemoveNodeButton({ element });
  const selected = useSelected();
  const isCollapsed = useEditorSelector(
    (editor) => editor.api.isCollapsed(),
    []
  );
  const isFocusedLast = useFocusedLast();

  const open = isFocusedLast && !readOnly && selected && isCollapsed;

  const onColumnChange = (widths: string[]) => {
    setColumns(editor, {
      at: element,
      widths,
    });
  };

  return (
    <Popover open={open} modal={false}>
      <PopoverAnchor>{children}</PopoverAnchor>
      <PopoverContent
        className="w-auto p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        align="center"
        side="top"
        sideOffset={10}
      >
        <div className="box-content flex h-8 items-center">
          <Button
            variant="ghost"
            className="size-8"
            onClick={() => onColumnChange(['50%', '50%'])}
          >
            <DoubleColumnOutlined />
          </Button>
          <Button
            variant="ghost"
            className="size-8"
            onClick={() => onColumnChange(['33%', '33%', '33%'])}
          >
            <ThreeColumnOutlined />
          </Button>
          <Button
            variant="ghost"
            className="size-8"
            onClick={() => onColumnChange(['70%', '30%'])}
          >
            <RightSideDoubleColumnOutlined />
          </Button>
          <Button
            variant="ghost"
            className="size-8"
            onClick={() => onColumnChange(['30%', '70%'])}
          >
            <LeftSideDoubleColumnOutlined />
          </Button>
          <Button
            variant="ghost"
            className="size-8"
            onClick={() => onColumnChange(['25%', '50%', '25%'])}
          >
            <DoubleSideDoubleColumnOutlined />
          </Button>

          <Separator orientation="vertical" className="mx-1 h-6" />
          <Button variant="ghost" className="size-8" {...buttonProps}>
            <Trash2Icon />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const DoubleColumnOutlined = (props: LucideProps) => (
  <svg
    fill="none"
    height="16"
    viewBox="0 0 16 16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      clipRule="evenodd"
      d="M8.5 3H13V13H8.5V3ZM7.5 2H8.5H13C13.5523 2 14 2.44772 14 3V13C14 13.5523 13.5523 14 13 14H8.5H7.5H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H7.5ZM7.5 13H3L3 3H7.5V13Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
);

const ThreeColumnOutlined = (props: LucideProps) => (
  <svg
    fill="none"
    height="16"
    viewBox="0 0 16 16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      clipRule="evenodd"
      d="M9.25 3H6.75V13H9.25V3ZM9.25 2H6.75H5.75H3C2.44772 2 2 2.44772 2 3V13C2 13.5523 2.44772 14 3 14H5.75H6.75H9.25H10.25H13C13.5523 14 14 13.5523 14 13V3C14 2.44772 13.5523 2 13 2H10.25H9.25ZM10.25 3V13H13V3H10.25ZM3 13H5.75V3H3L3 13Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
);

const RightSideDoubleColumnOutlined = (props: LucideProps) => (
  <svg
    fill="none"
    height="16"
    viewBox="0 0 16 16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      clipRule="evenodd"
      d="M11.25 3H13V13H11.25V3ZM10.25 2H11.25H13C13.5523 2 14 2.44772 14 3V13C14 13.5523 13.5523 14 13 14H11.25H10.25H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H10.25ZM10.25 13H3L3 3H10.25V13Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
);

const LeftSideDoubleColumnOutlined = (props: LucideProps) => (
  <svg
    fill="none"
    height="16"
    viewBox="0 0 16 16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      clipRule="evenodd"
      d="M5.75 3H13V13H5.75V3ZM4.75 2H5.75H13C13.5523 2 14 2.44772 14 3V13C14 13.5523 13.5523 14 13 14H5.75H4.75H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H4.75ZM4.75 13H3L3 3H4.75V13Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
);

const DoubleSideDoubleColumnOutlined = (props: LucideProps) => (
  <svg
    fill="none"
    height="16"
    viewBox="0 0 16 16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      clipRule="evenodd"
      d="M10.25 3H5.75V13H10.25V3ZM10.25 2H5.75H4.75H3C2.44772 2 2 2.44772 2 3V13C2 13.5523 2.44772 14 3 14H4.75H5.75H10.25H11.25H13C13.5523 14 14 13.5523 14 13V3C14 2.44772 13.5523 2 13 2H11.25H10.25ZM11.25 3V13H13V3H11.25ZM3 13H4.75V3H3L3 13Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
);
