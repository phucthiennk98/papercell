'use client';

import * as React from 'react';

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu';

import { exportToDocx } from '@platejs/docx-io';
import { MarkdownPlugin } from '@platejs/markdown';
import { ArrowDownToLineIcon, ChevronDownIcon, FileDownIcon, Loader2Icon } from 'lucide-react';
import type { SlatePlugin } from 'platejs';
import { useEditorRef } from 'platejs/react';
import { toast } from 'sonner';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BaseEditorKit } from '@/components/editor/editor-base-kit';

import { ToolbarButton } from './toolbar';
import { DocxExportKit } from '@/components/editor/plugins/docx-export-kit';
import { MetaContext } from '@/editor/DocHeader';
import { scan } from '@/editor/scan';
import { DataContext } from '@/figure/runtime';
import { docSlug, exportDocHtml } from '@/publish/export-html';

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c]!
  );
}

type OutlineAnchor = {
  text: string;
  level: number;
  ratioY: number;
};

export function ExportToolbarButton({
  variant = 'toolbar',
  ...props
}: DropdownMenuProps & { variant?: 'toolbar' | 'header' }) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const { meta } = React.useContext(MetaContext);
  const { files } = React.useContext(DataContext);
  const baseName = docSlug(meta.title);

  const runWithBusy = async (fn: () => Promise<void>) => {
    if (busy) return;
    setOpen(false);
    setBusy(true);
    await new Promise<void>((r) =>
      requestAnimationFrame(() => window.setTimeout(r, 0))
    );
    try {
      await fn();
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const getCanvasWithOutline = async (): Promise<{
    canvas: HTMLCanvasElement;
    outline: OutlineAnchor[];
  }> => {
    const { default: html2canvas } = await import('html2canvas-pro');
    const { headings } = scan(editor.children);
    const liveEditorNode = editor.api.toDOMNode(editor)!;
    const outline: OutlineAnchor[] = [];

    const canvas = await html2canvas(liveEditorNode, {
      backgroundColor: '#ffffff',
      scale: 2,
      onclone: (clonedDoc: Document, clonedEditor: HTMLElement) => {
        // Ensure all ancestor containers in the cloned iframe expand to full height
        let parent = clonedEditor.parentElement;
        while (parent && parent !== clonedDoc.documentElement) {
          parent.style.setProperty('overflow', 'visible', 'important');
          parent.style.setProperty('height', 'auto', 'important');
          parent.style.setProperty('max-height', 'none', 'important');
          parent = parent.parentElement;
        }

        clonedEditor.style.setProperty('padding', '48px 64px 64px', 'important');
        clonedEditor.style.setProperty('max-width', '860px', 'important');
        clonedEditor.style.setProperty('margin', '0 auto', 'important');
        clonedEditor.style.setProperty('height', 'auto', 'important');
        clonedEditor.style.setProperty('overflow', 'visible', 'important');
        clonedEditor.style.setProperty('background', '#ffffff', 'important');

        // 1. Remove edit-only elements and hidden figures so output matches Preview mode
        clonedEditor
          .querySelectorAll(
            '.fig.is-hidden, .fig-tools, .fig-alerts, .text-cell-tools, .insert-gap, .col-resize-handle, [data-slate-placeholder], button[aria-label="Open Formula Editor"]'
          )
          .forEach((el) => el.remove());

        // 2. Switch figures from edit styling to read-only Preview styling
        clonedEditor.querySelectorAll('.fig.is-edit').forEach((el) => {
          el.classList.remove('is-edit');
          el.classList.add('is-read');
        });

        // 3. Convert editable figure captions (<button> + <textarea>) into clean Preview text
        clonedEditor.querySelectorAll('.fig-caption').forEach((cap) => {
          const btn = cap.querySelector<HTMLButtonElement>('.fig-no-btn');
          const ta = cap.querySelector<HTMLTextAreaElement>('textarea');
          if (!btn && !ta) return;
          const captionText = (ta?.value ?? ta?.textContent ?? '').trim();
          const btnText = (btn?.textContent ?? '').trim();
          const hasNumber =
            btn &&
            !btn.classList.contains('none') &&
            /^(Figure|Table)\s+\d+\.?$/i.test(btnText);
          if (!captionText && !hasNumber) {
            cap.remove();
            return;
          }
          const noHtml = hasNumber
            ? `<b class="fig-no">${escapeHtml(btnText.endsWith('.') ? btnText : `${btnText}.`)}</b> `
            : '';
          cap.innerHTML = `<span>${noHtml}${escapeHtml(captionText)}</span>`;
        });

        // 4. Remove dashed column editing borders
        clonedEditor.querySelectorAll('.border-dashed').forEach((el) => {
          el.classList.remove('border-dashed', 'border-border');
          (el as HTMLElement).style.borderColor = 'transparent';
        });

        // 5. Prepend Document Header (Title, Authors, Date) with white-space: normal
        const preamble = clonedDoc.createElement('div');
        preamble.style.whiteSpace = 'normal';
        preamble.style.marginBottom = '24px';

        const titleText = meta.title?.trim() || 'Untitled';
        const subParts = [meta.authors?.trim(), meta.date?.trim()].filter(Boolean);
        preamble.innerHTML =
          `<div style="padding-bottom: 14px; border-bottom: 1px solid #e2e8f0;">` +
          `<h1 style="margin: 0; font-size: 32px; font-weight: 700; line-height: 1.2; letter-spacing: -0.02em; color: #0f172a;">${escapeHtml(titleText)}</h1>` +
          (subParts.length
            ? `<p style="margin: 8px 0 0; font-size: 14px; color: #64748b;">${escapeHtml(subParts.join(' · '))}</p>`
            : '') +
          `</div>`;

        clonedEditor.prepend(preamble);

        // 6. Measure exact heading vertical positions for native PDF sidebar Outline
        const editorRect = clonedEditor.getBoundingClientRect();
        const totalHeight = Math.max(1, clonedEditor.scrollHeight, editorRect.height);
        const headingEls = Array.from(
          clonedEditor.querySelectorAll<HTMLElement>('h1, h2, h3')
        ).filter((el) => !preamble.contains(el));

        const validHeadings = headings.filter((h) => h.text.trim().length > 0);
        if (validHeadings.length > 0) {
          validHeadings.forEach((h, idx) => {
            const byId = h.id
              ? clonedEditor.querySelector<HTMLElement>(
                  `[data-block-id="${CSS.escape(h.id)}"], #${CSS.escape(h.id)}`
                )
              : null;
            const targetEl = byId ?? headingEls[idx];
            const topPx = targetEl
              ? Math.max(0, targetEl.getBoundingClientRect().top - editorRect.top - 16)
              : 0;
            outline.push({
              text: h.text.trim(),
              level: h.level,
              ratioY: Math.min(1, Math.max(0, topPx / totalHeight)),
            });
          });
        } else {
          headingEls.forEach((el) => {
            const text = (el.textContent ?? '').trim();
            if (!text) return;
            const level = Number(el.tagName.slice(1)) || 2;
            const topPx = Math.max(0, el.getBoundingClientRect().top - editorRect.top - 16);
            outline.push({
              text,
              level,
              ratioY: Math.min(1, Math.max(0, topPx / totalHeight)),
            });
          });
        }
      },
    });

    return { canvas, outline };
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  const canvasToBlob = (
    canvas: HTMLCanvasElement,
    type: string,
    quality?: number
  ) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas encoding failed'))),
        type,
        quality
      );
    });

  const exportToPdf = () =>
    runWithBusy(async () => {
      const { canvas, outline } = await getCanvasWithOutline();

      const [PDFLib, jpgBlob] = await Promise.all([
        import('pdf-lib'),
        canvasToBlob(canvas, 'image/jpeg', 0.92),
      ]);
      const jpgBytes = new Uint8Array(await jpgBlob.arrayBuffer());

      const pdfDoc = await PDFLib.PDFDocument.create();
      if (meta.title) pdfDoc.setTitle(meta.title);
      if (meta.authors) pdfDoc.setAuthor(meta.authors);

      // Use 1x CSS points for PDF page size (while embedding 2x high-DPI JPEG)
      // so PDF page height stays within standard PDF coordinate limits (<= 14,400pt).
      const pageWidth = Math.round(canvas.width / 2);
      const pageHeight = Math.round(canvas.height / 2);
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      const imageEmbed = await pdfDoc.embedJpg(jpgBytes);
      page.drawImage(imageEmbed, {
        height: pageHeight,
        width: pageWidth,
        x: 0,
        y: 0,
      });

      // Attach native PDF Document Outline (left-side bookmarks panel in PDF viewers).
      // Chromium's viewer-bookmark requires explicit numeric X and Y coordinates in /XYZ
      // (if X is PDFNull, Chromium omits bookmark.x and falls back to jumping to page top).
      if (outline.length > 0) {
        const ctx = pdfDoc.context;
        const outlinesRef = ctx.nextRef();
        const itemRefs = outline.map(() => ctx.nextRef());

        outline.forEach((item, i) => {
          const yCoord = Math.round(pageHeight * (1 - item.ratioY));
          const prefix = item.level > 1 ? `${'  '.repeat(item.level - 1)}` : '';
          const destArray = ctx.obj([
            page.ref,
            PDFLib.PDFName.of('XYZ'),
            PDFLib.PDFNumber.of(0),
            PDFLib.PDFNumber.of(yCoord),
            PDFLib.PDFNumber.of(0),
          ]);
          const dictMap = new Map<any, any>();
          dictMap.set(
            PDFLib.PDFName.of('Title'),
            PDFLib.PDFHexString.fromText(`${prefix}${item.text}`)
          );
          dictMap.set(PDFLib.PDFName.of('Parent'), outlinesRef);
          if (i > 0) dictMap.set(PDFLib.PDFName.of('Prev'), itemRefs[i - 1]);
          if (i < outline.length - 1) {
            dictMap.set(PDFLib.PDFName.of('Next'), itemRefs[i + 1]);
          }
          dictMap.set(PDFLib.PDFName.of('Dest'), destArray);
          ctx.assign(itemRefs[i], PDFLib.PDFDict.fromMapWithContext(dictMap, ctx));
        });

        const rootMap = new Map<any, any>();
        rootMap.set(PDFLib.PDFName.of('Type'), PDFLib.PDFName.of('Outlines'));
        rootMap.set(PDFLib.PDFName.of('First'), itemRefs[0]);
        rootMap.set(PDFLib.PDFName.of('Last'), itemRefs[itemRefs.length - 1]);
        rootMap.set(
          PDFLib.PDFName.of('Count'),
          PDFLib.PDFNumber.of(itemRefs.length)
        );
        ctx.assign(outlinesRef, PDFLib.PDFDict.fromMapWithContext(rootMap, ctx));

        pdfDoc.catalog.set(PDFLib.PDFName.of('Outlines'), outlinesRef);
        pdfDoc.catalog.set(
          PDFLib.PDFName.of('PageMode'),
          PDFLib.PDFName.of('UseOutlines')
        );
      }

      const pdfBytes = await pdfDoc.save();
      downloadBlob(
        new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }),
        `${baseName}.pdf`
      );
    });

  const exportToImage = () =>
    runWithBusy(async () => {
      const { canvas } = await getCanvasWithOutline();
      const pngBlob = await canvasToBlob(canvas, 'image/png');
      downloadBlob(pngBlob, `${baseName}.png`);
    });

  // Papercell: export standalone interactive HTML using the Papercell viewer (figures and sliders remain live)
  // instead of Plate's static HTML serializer which omits interactive figure cards.
  const exportToHtml = () =>
    exportDocHtml({ meta, files, content: editor.children });

  const exportToMarkdown = async () => {
    const { headings } = scan(editor.children);
    const bodyMd = editor.getApi(MarkdownPlugin).markdown.serialize();
    const headerLines: string[] = [];
    if (meta.title?.trim()) headerLines.push(`# ${meta.title.trim()}`);
    const sub = [meta.authors?.trim(), meta.date?.trim()]
      .filter(Boolean)
      .join(' · ');
    if (sub) headerLines.push(`*${sub}*`);
    const validHeadings = headings.filter((h) => h.text.trim().length > 0);
    if (validHeadings.length > 0) {
      headerLines.push(
        '## Contents\n' +
          validHeadings
            .map((h) => `${'  '.repeat(Math.max(0, h.level - 1))}- ${h.text}`)
            .join('\n')
      );
    }
    const fullMd =
      headerLines.length > 0
        ? `${headerLines.join('\n\n')}\n\n---\n\n${bodyMd}`
        : bodyMd;
    downloadBlob(
      new Blob([fullMd], { type: 'text/markdown;charset=utf-8' }),
      `${baseName}.md`
    );
  };

  const exportToWord = () =>
    runWithBusy(async () => {
      const blob = await exportToDocx(editor.children, {
        editorPlugins: [...BaseEditorKit, ...DocxExportKit] as SlatePlugin[],
      });
      downloadBlob(blob, `${baseName}.docx`);
    });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger asChild>
        {variant === 'header' ? (
          <button
            type="button"
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-sm hover:bg-accent disabled:opacity-60 sm:px-2.5"
            aria-label="Export"
            title="Export document (HTML, PDF, PNG, Markdown, Word)"
          >
            {busy ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <FileDownIcon className="size-3.5" />
            )}
            <span className="hidden lg:inline">
              {busy ? 'Exporting…' : 'Export'}
            </span>
            <ChevronDownIcon className="size-3.5 text-muted-foreground" />
          </button>
        ) : (
          <ToolbarButton
            pressed={open}
            disabled={busy}
            tooltip={busy ? 'Exporting…' : 'Export / download'}
            isDropdown
          >
            {busy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <ArrowDownToLineIcon className="size-4" />
            )}
          </ToolbarButton>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align={variant === 'header' ? 'end' : 'start'}>
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={exportToHtml}>
            HTML (interactive figures, opens anywhere)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportToPdf}>
            PDF (preview with sidebar outline)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportToImage}>
            PNG image (preview snapshot)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportToMarkdown}>
            Markdown (with contents)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={exportToWord}>
            Word (.docx)
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
