'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import type { TextareaAutosizeProps } from 'react-textarea-autosize';

import type { TEquationElement } from 'platejs';
import type { PlateElementProps } from 'platejs/react';

import { BlockSelectionPlugin } from '@platejs/selection/react';
import {
  BookTemplateIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Code2Icon,
  CornerDownLeftIcon,
  Maximize2Icon,
  PencilIcon,
  PlusIcon,
  RadicalIcon,
  SparklesIcon,
  XIcon,
} from 'lucide-react';
import {
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useElement,
  useReadOnly,
  useSelected,
} from 'platejs/react';

import { openAIChatOnElement } from '@/components/editor/plugins/ai-kit';
import { Button } from '@/components/ui/button';
import {
  applySessionInput,
  COMMON_GREEK_PALETTE,
  COMMON_OPERATOR_PALETTE,
  COMMON_VARIABLE_PALETTE,
  createTokenEditSession,
  FORMULA_TEMPLATES,
  type MathToken,
  renderInteractiveKatex,
  renderMiniKatex,
  STRUCTURE_TEMPLATES,
  type TokenEditSession,
  tokenizeLatex,
  wrapTokenWithStructure,
} from '@/components/ui/equation-visual';
import { inlineSuggestionVariants } from '@/lib/suggestion';
import { cn } from '@/lib/utils';

function getDefaultTokenIndex(tokens: MathToken[]): number {
  if (tokens.length === 0) return 0;
  const placeholderIdx = tokens.findIndex((t) => t.kind === 'placeholder');
  if (placeholderIdx >= 0) return placeholderIdx;
  const numberIdx = tokens.findIndex((t) => t.kind === 'number');
  if (numberIdx >= 0) return numberIdx;
  return 0;
}

function InteractiveKatexSurface({
  activeTokenId,
  className,
  displayMode = true,
  highlightAllSame = false,
  onSelectToken,
  texExpression,
  tokens,
}: {
  activeTokenId: number | null;
  className?: string;
  displayMode?: boolean;
  highlightAllSame?: boolean;
  onSelectToken?: (
    tokenId: number,
    tokenEl: HTMLElement,
    event: React.MouseEvent
  ) => void;
  texExpression: string;
  tokens: MathToken[];
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const containerRef = React.useRef<HTMLSpanElement | null>(null);

  const html = React.useMemo(
    () => renderInteractiveKatex(texExpression, tokens, { displayMode }),
    [texExpression, tokens, displayMode]
  );

  React.useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const activeToken =
      activeTokenId !== null && activeTokenId >= 0
        ? tokens[activeTokenId]
        : undefined;

    const nodes = root.querySelectorAll<HTMLElement>('[data-eqtok]');
    nodes.forEach((node) => {
      const id = Number(node.dataset.eqtok);
      node.classList.remove('eq-token-active', 'eq-token-same');
      if (onSelectToken) {
        node.title = 'Click to edit formula';
      }
      if (activeToken && id === activeToken.id) {
        node.classList.add('eq-token-active');
      } else if (
        activeToken &&
        highlightAllSame &&
        tokens[id]?.raw === activeToken.raw
      ) {
        node.classList.add('eq-token-same');
      }
    });
  }, [html, activeTokenId, highlightAllSame, onSelectToken, tokens]);

  React.useLayoutEffect(() => {
    if (!displayMode) return;
    const host = hostRef.current;
    const el = containerRef.current;
    if (!host || !el) return;

    const fit = () => {
      el.style.fontSize = '';
      const avail = host.clientWidth - 8;
      const katexEl = el.querySelector<HTMLElement>('.katex-html') ?? el;
      const natural = katexEl.scrollWidth;
      if (avail > 40 && natural > avail) {
        const ratio = Math.max(0.45, (avail / natural) * 0.98);
        el.style.fontSize = `${(ratio * 100).toFixed(1)}%`;
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [html, displayMode]);

  const inner = (
    <span
      ref={containerRef}
      className={cn(onSelectToken ? 'eq-interactive' : '', !displayMode && className)}
      onClick={(e) => {
        if (!onSelectToken) return;
        const target = (e.target as HTMLElement | null)?.closest?.(
          '[data-eqtok]'
        ) as HTMLElement | null;
        if (target && target.dataset.eqtok !== undefined) {
          const id = Number(target.dataset.eqtok);
          if (!Number.isNaN(id)) {
            onSelectToken(id, target, e);
          }
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );

  if (!displayMode) return inner;
  return (
    <div
      ref={hostRef}
      className={cn('flex w-full max-w-full items-center justify-center overflow-hidden', className)}
    >
      {inner}
    </div>
  );
}

const IGNORED_LATEX_COMMANDS = new Set([
  'frac',
  'dfrac',
  'tfrac',
  'sqrt',
  'left',
  'right',
  'big',
  'Big',
  'bigg',
  'Bigg',
  'quad',
  'qquad',
  'text',
  'textrm',
  'textit',
  'textbf',
  'mathrm',
  'mathbf',
  'mathit',
  'mathsf',
  'mathcal',
  'mathbb',
  'begin',
  'end',
  'exp',
  'ln',
  'log',
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'min',
  'max',
  'sup',
  'inf',
  'lim',
  'det',
  'dim',
  'ker',
  'arg',
  'deg',
  'gcd',
  'Pr',
  'sum',
  'prod',
  'coprod',
  'int',
  'iint',
  'iiint',
  'oint',
  'cdot',
  'cdots',
  'ldots',
  'ddots',
  'vdots',
  'times',
  'div',
  'pm',
  'mp',
  'leq',
  'le',
  'geq',
  'ge',
  'neq',
  'ne',
  'approx',
  'sim',
  'simeq',
  'cong',
  'equiv',
  'propto',
  'to',
  'rightarrow',
  'leftarrow',
  'leftrightarrow',
  'Rightarrow',
  'Leftarrow',
  'Leftrightarrow',
  'mapsto',
  'in',
  'notin',
  'ni',
  'subset',
  'subseteq',
  'supset',
  'supseteq',
  'cup',
  'cap',
  'setminus',
  'emptyset',
  'varnothing',
  'forall',
  'exists',
  'nexists',
  'neg',
  'land',
  'lor',
  'partial',
  'nabla',
  'infty',
  'square',
  'newline',
  'hat',
  'bar',
  'vec',
  'tilde',
  'dot',
  'ddot',
  'overline',
  'underline',
]);

/** Extracts unique LaTeX variable and symbol expressions (including subscripts like \Delta T_0, f_c) from a formula. */
export function extractFormulaVariablesLatex(tex: string): string[] {
  const cleaned = tex
    .replace(/\\(?:text|textrm|mathrm|textbf|textit)\s*\{[^{}]*\}/g, ' ')
    .replace(/\\(?:begin|end)\s*\{[^{}]*\}/g, ' ');
  const pattern =
    /(?:\\(?:Delta|nabla|partial)\s*[A-Za-z]|\\[A-Za-z]+|[A-Za-z])(?:\s*_(?:\{[^{}]*\}|[A-Za-z0-9]))?(?:\s*\^(?:\{[^{}]*\}|[A-Za-z0-9]))?/g;
  const result: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleaned)) !== null) {
    const raw = match[0].trim().replace(/\s+/g, '');
    const cmdMatch = /^\\([A-Za-z]+)$/.exec(raw.split(/[_^]/)[0]);
    if (cmdMatch && IGNORED_LATEX_COMMANDS.has(cmdMatch[1])) continue;
    const normalized = raw.replace(/^\\(Delta|nabla|partial)([A-Za-z])/, '\\$1 $2');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

export type DescriptionListStyle = 'bullet' | 'circle' | 'square' | 'number' | 'alpha';
export type DescriptionDisplayMode = 'inline' | 'popup' | 'none';

const LIST_PREFIX_RE = /^(?:([•\-*])|([◦○])|([▪■□])|(\d+[.)])|([a-zA-Z][.)]))\s+(.*)$/;

function stripListPrefix(line: string): string {
  const m = LIST_PREFIX_RE.exec(line.trim());
  return m ? m[6] : line.trim();
}

export function detectDescriptionListStyle(text: string): DescriptionListStyle {
  const first = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!first) return 'bullet';
  const m = LIST_PREFIX_RE.exec(first);
  if (!m) return 'bullet';
  if (m[2]) return 'circle';
  if (m[3]) return 'square';
  if (m[4]) return 'number';
  if (m[5]) return 'alpha';
  return 'bullet';
}

export function formatDescriptionLinesWithStyle(
  text: string,
  style: DescriptionListStyle,
  fallbackVariables: string[] = []
): string {
  let rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (rawLines.length === 1 && rawLines[0].includes('; ')) {
    rawLines = rawLines[0]
      .split(/;\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (rawLines.length === 0) {
    rawLines =
      fallbackVariables.length > 0
        ? fallbackVariables.map((v) => `$${v}$: `)
        : [''];
  }
  return rawLines
    .map((line, idx) => {
      const body = stripListPrefix(line);
      const prefix =
        style === 'bullet'
          ? '• '
          : style === 'circle'
            ? '◦ '
            : style === 'square'
              ? '▪ '
              : style === 'number'
                ? `${idx + 1}. `
                : `${String.fromCharCode(97 + (idx % 26))}) `;
      return `${prefix}${body}`;
    })
    .join('\n');
}

function renderInlineSegmentWithKatex(text: string): React.ReactNode[] {
  const parts = text.split(/(\$[^$]+\$)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      const math = part.slice(1, -1);
      return (
        <span
          key={idx}
          className="mx-0.5 inline-block align-baseline"
          dangerouslySetInnerHTML={{ __html: renderMiniKatex(math) }}
        />
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function parseVariableDefinitionLine(body: string): {
  lhsLatex: string | null;
  rhsText: string;
} {
  // 1. Explicit $...$: explanation or $...$ — explanation
  const explicitMatch = /^\$([^$]+)\$\s*(?::|—|–|-)\s*(.*)$/.exec(body);
  if (explicitMatch) {
    return { lhsLatex: explicitMatch[1].trim(), rhsText: explicitMatch[2] };
  }
  // 2. Unwrapped LaTeX or short symbol before ':'
  const colonIdx = body.indexOf(':');
  if (colonIdx > 0 && colonIdx <= 42) {
    const lhs = body.slice(0, colonIdx).trim();
    const rhs = body.slice(colonIdx + 1).trim();
    const looksLikeMath =
      /[\\_^=<>~]/.test(lhs) ||
      lhs.split(/\s+/).length <= 2;
    if (looksLikeMath) {
      return { lhsLatex: lhs.replace(/^\$|\$$/g, ''), rhsText: rhs };
    }
  }
  return { lhsLatex: null, rhsText: body };
}

export interface DescriptionRowItem {
  lhs: string;
  rhs: string;
}

export function parseDescriptionRows(text: string): DescriptionRowItem[] {
  let raw = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (raw.length === 1 && raw[0].includes('; ')) {
    raw = raw[0]
      .split(/;\s+/)
      .map((s) => `• ${s.trim()}`);
  }
  return raw.map((line) => {
    const m = LIST_PREFIX_RE.exec(line);
    const body = m ? m[6] : line;
    const { lhsLatex, rhsText } = parseVariableDefinitionLine(body);
    return { lhs: lhsLatex ?? '', rhs: rhsText };
  });
}

export function serializeDescriptionRows(
  style: DescriptionListStyle,
  rows: DescriptionRowItem[]
): string {
  return rows
    .map((r, idx) => {
      const prefix =
        style === 'bullet'
          ? '• '
          : style === 'circle'
            ? '◦ '
            : style === 'square'
              ? '▪ '
              : style === 'number'
                ? `${idx + 1}. `
                : `${String.fromCharCode(97 + (idx % 26))}) `;
      const lhsClean = r.lhs.trim().replace(/^\$|\$$/g, '');
      const body = lhsClean ? `$${lhsClean}$: ${r.rhs}` : r.rhs;
      return `${prefix}${body}`;
    })
    .join('\n');
}

export function BlackListMarker({
  index,
  marker,
  style,
}: {
  index?: number;
  marker?: string;
  style?: DescriptionListStyle;
}) {
  const effectiveStyle =
    style ??
    (marker === '◦'
      ? 'circle'
      : marker === '▪'
        ? 'square'
        : marker && /^\d/.test(marker)
          ? 'number'
          : marker && /^[a-zA-Z]/.test(marker)
            ? 'alpha'
            : 'bullet');

  if (effectiveStyle === 'bullet') {
    return (
      <span className="inline-flex w-3.5 shrink-0 select-none items-center justify-center self-center">
        <span
          className="inline-block rounded-full bg-slate-950"
          style={{ width: 3.5, height: 3.5 }}
        />
      </span>
    );
  }
  if (effectiveStyle === 'circle') {
    return (
      <span className="inline-flex w-3.5 shrink-0 select-none items-center justify-center self-center">
        <span
          className="inline-block rounded-full border border-slate-950 bg-transparent"
          style={{ width: 4, height: 4 }}
        />
      </span>
    );
  }
  if (effectiveStyle === 'square') {
    return (
      <span className="inline-flex w-3.5 shrink-0 select-none items-center justify-center self-center">
        <span
          className="inline-block bg-slate-950"
          style={{ width: 3.5, height: 3.5 }}
        />
      </span>
    );
  }
  const label =
    marker ||
    (effectiveStyle === 'number'
      ? `${(index ?? 0) + 1}.`
      : `${String.fromCharCode(97 + ((index ?? 0) % 26))})`);
  return (
    <span className="min-w-[1.25rem] shrink-0 select-none text-right font-semibold text-slate-950">
      {label}
    </span>
  );
}

export function FormattedFormulaDescription({
  compact = false,
  text,
}: {
  compact?: boolean;
  text: string;
}) {
  const lines = React.useMemo(() => {
    const raw = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (raw.length === 1 && raw[0].includes('; ')) {
      return raw[0]
        .split(/;\s+/)
        .map((s) => `• ${s.trim()}`);
    }
    return raw;
  }, [text]);

  if (lines.length === 0) return null;

  return (
    <div className={cn('space-y-1.5 text-foreground', compact ? 'text-xs' : 'text-sm')}>
      {lines.map((line, idx) => {
        const m = LIST_PREFIX_RE.exec(line);
        const marker = m
          ? m[1]
            ? '•'
            : m[2]
              ? '◦'
              : m[3]
                ? '▪'
                : m[4] || m[5] || ''
          : '';
        const body = m ? m[6] : line;
        const { lhsLatex, rhsText } = parseVariableDefinitionLine(body);

        return (
          <div
            key={idx}
            className="flex items-baseline gap-2 leading-relaxed break-words"
          >
            {marker && <BlackListMarker marker={marker} index={idx} />}
            <div className="min-w-0 flex-1">
              {lhsLatex ? (
                <>
                  <span
                    className="inline-block align-baseline"
                    dangerouslySetInnerHTML={{
                      __html: renderMiniKatex(lhsLatex),
                    }}
                  />
                  <span className="mx-1.5 text-muted-foreground">—</span>
                  <span className="text-foreground/90">
                    {renderInlineSegmentWithKatex(rhsText)}
                  </span>
                </>
              ) : (
                <span className="text-foreground/90">
                  {renderInlineSegmentWithKatex(rhsText)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EquationPreviewDialog({
  description,
  descriptionMode = 'inline',
  onClose,
  texExpression,
  tokens,
}: {
  description?: string;
  descriptionMode?: DescriptionDisplayMode;
  onClose: () => void;
  texExpression: string;
  tokens: MathToken[];
}) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);

  const copyLatex = () => {
    navigator.clipboard?.writeText(texExpression);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const hasNotes =
    descriptionMode !== 'none' && Boolean(description && description.trim());

  return createPortal(
    <div className="dlg-backdrop" onMouseDown={onClose}>
      <div
        className="dlg dlg-small"
        role="dialog"
        aria-modal="true"
        aria-label="Formula details"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="dlg-head">
          <div className="dlg-title flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-md bg-blue-50 text-blue-700">
              <RadicalIcon className="size-4" />
            </span>
            <span>Formula Details</span>
          </div>
          <button type="button" className="btn" onClick={copyLatex}>
            <Code2Icon className="size-3.5" />
            <span>{copied ? 'Copied LaTeX' : 'Copy LaTeX'}</span>
          </button>
          <button
            type="button"
            className="pc-icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <XIcon size={17} />
          </button>
        </header>
        <div className="dlg-body flex flex-col gap-4 p-5">
          <div className="flex min-h-[104px] items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/70 px-6 py-5">
            <InteractiveKatexSurface
              texExpression={texExpression}
              tokens={tokens}
              activeTokenId={null}
              displayMode
              className="text-[1.35rem]"
            />
          </div>

          {hasNotes ? (
            <div className="rounded-xl border bg-background p-4 space-y-2.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Description &amp; Variable Notes
              </div>
              <FormattedFormulaDescription text={description!.trim()} />
            </div>
          ) : (
            <p className="hint">
              No variable notes attached to this formula cell. Switch to Edit mode if you want to add inline or popup LaTeX variable explanations.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function EquationElement(props: PlateElementProps<TEquationElement>) {
  const texExpression =
    typeof props.element.texExpression === 'string' ||
    typeof props.element.texExpression === 'number' ||
    typeof props.element.texExpression === 'boolean'
      ? String(props.element.texExpression)
      : '';
  const description =
    typeof (props.element as any).description === 'string'
      ? (props.element as any).description
      : '';
  const descriptionMode: DescriptionDisplayMode =
    (props.element as any).descriptionMode === 'none' ||
    (props.element as any).descriptionMode === 'popup' ||
    (props.element as any).descriptionMode === 'inline'
      ? (props.element as any).descriptionMode
      : 'inline';
  const selected = useSelected();
  const readOnly = useReadOnly();
  const [open, setOpen] = React.useState(false);
  const autoOpen = Boolean((props.element as any).autoOpen);
  const tokens = React.useMemo(
    () => tokenizeLatex(texExpression),
    [texExpression]
  );
  const [selectedTokenId, setSelectedTokenId] = React.useState<number>(() =>
    getDefaultTokenIndex(tokens)
  );
  const [selectionTick, setSelectionTick] = React.useState(0);
  const [syncAllMatching, setSyncAllMatching] = React.useState(false);

  // Auto-open when a brand-new empty equation block is inserted or autoOpen is flagged
  React.useEffect(() => {
    if (readOnly) return;
    if (autoOpen) {
      setOpen(true);
      const at = props.editor.api.findPath(props.element);
      if (at) {
        props.editor.tf.setNodes({ autoOpen: undefined } as any, { at });
      }
      return;
    }
    if (selected && texExpression.trim().length === 0) {
      setOpen(true);
    }
  }, [autoOpen, props.editor, props.element, selected, readOnly, texExpression]);

  const lineBreakBadge = (
    props as PlateElementProps<TEquationElement> & {
      lineBreakBadge?: React.ReactNode;
    }
  ).lineBreakBadge;

  const safeSelectedId =
    tokens.length === 0
      ? null
      : Math.min(Math.max(0, selectedTokenId), tokens.length - 1);

  return (
    <PlateElement className="my-1" {...props}>
      <div
        className={cn(
          'group relative flex max-w-full cursor-pointer select-none flex-col items-center justify-center overflow-hidden rounded-md border border-transparent transition-colors hover:border-border hover:bg-muted/60 data-[selected=true]:border-blue-300 data-[selected=true]:bg-primary/5',
          texExpression.length === 0 ? 'bg-muted p-3 pr-9' : 'px-3 py-2'
        )}
        data-selected={selected || open}
        contentEditable={false}
        role="button"
        title={
          readOnly
            ? 'Click to view formula details & variable explanations'
            : 'Click any number or symbol to open Formula Editor'
        }
        onClick={(e) => {
          if (readOnly) {
            if (texExpression.trim().length > 0) {
              setOpen(true);
            }
            return;
          }
          const tokEl = (e.target as HTMLElement | null)?.closest?.(
            '[data-eqtok]'
          ) as HTMLElement | null;
          if (tokEl && tokEl.dataset.eqtok !== undefined) {
            const id = Number(tokEl.dataset.eqtok);
            if (!Number.isNaN(id)) {
              setSelectedTokenId(id);
              setSelectionTick((t) => t + 1);
            }
            setOpen(true);
          } else {
            if (tokens.length > 0 && !open) {
              setSelectedTokenId(getDefaultTokenIndex(tokens));
              setSelectionTick((t) => t + 1);
            }
            setOpen(true);
          }
        }}
      >
        {texExpression.length > 0 ? (
          <>
            <InteractiveKatexSurface
              texExpression={texExpression}
              tokens={tokens}
              activeTokenId={open && !readOnly ? safeSelectedId : null}
              highlightAllSame={open && !readOnly && syncAllMatching}
              displayMode
              onSelectToken={(id) => {
                if (readOnly) {
                  setOpen(true);
                  return;
                }
                setSelectedTokenId(id);
                setSelectionTick((t) => t + 1);
                setOpen(true);
              }}
            />
            {descriptionMode === 'inline' && description.trim().length > 0 && (
              <div className="mt-2 w-full text-left">
                <FormattedFormulaDescription
                  text={description.trim()}
                  compact
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex h-7 w-full items-center gap-2 whitespace-nowrap text-muted-foreground text-sm">
            <RadicalIcon className="size-6 text-muted-foreground/80" />
            <div>Click to open Formula Editor or pick a template</div>
          </div>
        )}

        {texExpression.length > 0 && (
          <button
            type="button"
            className="pc-icon-btn absolute right-2 bottom-1.5 opacity-0 transition-opacity group-hover:opacity-100"
            aria-label={readOnly ? 'View Formula Details' : 'Open Formula Editor'}
            data-tip={
              readOnly
                ? 'View formula details & description'
                : 'Edit formula in large popup'
            }
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
          >
            <Maximize2Icon className="size-3.5" />
          </button>
        )}
        {lineBreakBadge}
      </div>

      {open && readOnly && (
        <EquationPreviewDialog
          texExpression={texExpression}
          description={description}
          descriptionMode={descriptionMode}
          tokens={tokens}
          onClose={() => setOpen(false)}
        />
      )}

      {open && !readOnly && (
        <EquationDialog
          isInline={false}
          open={open}
          placeholder={
            'f(x) = \\begin{cases}\n  x^2, &\\quad x > 0 \\\\\n  0, &\\quad x = 0 \\\\\n  -x^2, &\\quad x < 0\n\\end{cases}'
          }
          selectedTokenId={safeSelectedId ?? 0}
          selectionTick={selectionTick}
          setOpen={setOpen}
          setSelectedTokenId={setSelectedTokenId}
          setSyncAllMatching={setSyncAllMatching}
          syncAllMatching={syncAllMatching}
        />
      )}

      {props.children}
    </PlateElement>
  );
}

export function InlineEquationElement(
  props: PlateElementProps<TEquationElement>
) {
  const { element } = props;
  const texExpression =
    typeof element.texExpression === 'string' ||
    typeof element.texExpression === 'number' ||
    typeof element.texExpression === 'boolean'
      ? String(element.texExpression)
      : '';
  const selected = useSelected();
  const readOnly = useReadOnly();
  const isCollapsed = useEditorSelector(
    (editor) => editor.api.isCollapsed(),
    []
  );
  const [open, setOpen] = React.useState(false);
  const tokens = React.useMemo(
    () => tokenizeLatex(texExpression),
    [texExpression]
  );
  const [selectedTokenId, setSelectedTokenId] = React.useState<number>(() =>
    getDefaultTokenIndex(tokens)
  );
  const [selectionTick, setSelectionTick] = React.useState(0);
  const [syncAllMatching, setSyncAllMatching] = React.useState(false);

  React.useEffect(() => {
    if (
      selected &&
      isCollapsed &&
      !readOnly &&
      texExpression.trim().length === 0
    ) {
      setOpen(true);
    }
  }, [selected, isCollapsed, readOnly, texExpression]);

  const safeSelectedId =
    tokens.length === 0
      ? null
      : Math.min(Math.max(0, selectedTokenId), tokens.length - 1);

  return (
    <PlateElement
      {...props}
      className={cn(
        'mx-1 inline-block select-none rounded-sm [&_.katex-display]:my-0!'
      )}
    >
      <div
        className={cn(
          'after:-top-0.5 after:-left-1 after:absolute after:inset-0 after:z-1 after:h-[calc(100%)+4px] after:w-[calc(100%+8px)] after:rounded-sm after:content-[""]',
          'h-6 cursor-pointer',
          inlineSuggestionVariants(),
          ((texExpression.length > 0 && open) || selected) &&
            'after:bg-brand/15',
          texExpression.length === 0 &&
            'text-muted-foreground after:bg-neutral-500/10'
        )}
        contentEditable={false}
        onClick={(e) => {
          if (readOnly) return;
          const tokEl = (e.target as HTMLElement | null)?.closest?.(
            '[data-eqtok]'
          ) as HTMLElement | null;
          if (tokEl && tokEl.dataset.eqtok !== undefined) {
            const id = Number(tokEl.dataset.eqtok);
            if (!Number.isNaN(id)) {
              setSelectedTokenId(id);
              setSelectionTick((t) => t + 1);
            }
          }
          setOpen(true);
        }}
      >
        {texExpression.length > 0 && (
          <InteractiveKatexSurface
            texExpression={texExpression}
            tokens={tokens}
            activeTokenId={open ? safeSelectedId : null}
            highlightAllSame={open && syncAllMatching}
            displayMode
            className="font-mono leading-none"
            onSelectToken={(id) => {
              if (readOnly) return;
              setSelectedTokenId(id);
              setSelectionTick((t) => t + 1);
              setOpen(true);
            }}
          />
        )}
        {texExpression.length === 0 && (
          <span>
            <RadicalIcon className="mr-1 inline-block h-[19px] w-4 py-[1.5px] align-text-bottom" />
            New formula
          </span>
        )}
      </div>

      {open && !readOnly && (
        <EquationDialog
          isInline
          open={open}
          placeholder="E = mc^2"
          selectedTokenId={safeSelectedId ?? 0}
          selectionTick={selectionTick}
          setOpen={setOpen}
          setSelectedTokenId={setSelectedTokenId}
          setSyncAllMatching={setSyncAllMatching}
          syncAllMatching={syncAllMatching}
        />
      )}

      {props.children}
    </PlateElement>
  );
}

const TOKEN_KIND_LABEL: Record<MathToken['kind'], string> = {
  number: 'Number',
  operator: 'Operator',
  placeholder: 'Slot □',
  symbol: 'Symbol',
  variable: 'Variable',
};

type EquationDialogTab = 'visual' | 'templates' | 'latex';

const EquationDialog = ({
  isInline,
  open,
  placeholder,
  selectedTokenId,
  selectionTick,
  setOpen,
  setSelectedTokenId,
  setSyncAllMatching,
  syncAllMatching,
}: {
  isInline: boolean;
  open: boolean;
  placeholder?: string;
  selectedTokenId: number;
  selectionTick: number;
  setOpen: (open: boolean) => void;
  setSelectedTokenId: React.Dispatch<React.SetStateAction<number>>;
  setSyncAllMatching: React.Dispatch<React.SetStateAction<boolean>>;
  syncAllMatching: boolean;
} & TextareaAutosizeProps) => {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const element = useElement<TEquationElement>();
  const dlgRef = React.useRef<HTMLDivElement | null>(null);
  const valueInputRef = React.useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = React.useState<EquationDialogTab>('visual');
  const [paletteTab, setPaletteTab] = React.useState<
    'structures' | 'greek' | 'operators'
  >('structures');

  const texExpression =
    typeof element.texExpression === 'string' ||
    typeof element.texExpression === 'number' ||
    typeof element.texExpression === 'boolean'
      ? String(element.texExpression)
      : '';

  const tokens = React.useMemo(
    () => tokenizeLatex(texExpression),
    [texExpression]
  );

  const clampedTokenId =
    tokens.length > 0
      ? Math.min(Math.max(0, selectedTokenId), tokens.length - 1)
      : 0;
  const activeToken = tokens[clampedTokenId] ?? null;

  const [session, setSession] = React.useState<TokenEditSession | null>(null);
  const [draftValue, setDraftValue] = React.useState<string>('');

  const updateTexExpression = React.useCallback(
    (nextTex: string) => {
      editor.tf.setNodes<TEquationElement>(
        { texExpression: nextTex },
        { at: element }
      );
    },
    [editor, element]
  );

  const description: string =
    typeof (element as any).description === 'string'
      ? (element as any).description
      : '';

  const descriptionMode: DescriptionDisplayMode =
    (element as any).descriptionMode === 'none' ||
    (element as any).descriptionMode === 'popup' ||
    (element as any).descriptionMode === 'inline'
      ? (element as any).descriptionMode
      : 'inline';

  const [activeListStyle, setActiveListStyle] = React.useState<DescriptionListStyle>(() =>
    detectDescriptionListStyle(description)
  );
  const [editingLhsIdx, setEditingLhsIdx] = React.useState<number | null>(null);
  const [editingRhsIdx, setEditingRhsIdx] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (description.trim()) {
      setActiveListStyle(detectDescriptionListStyle(description));
    }
  }, [description]);

  const descRows = React.useMemo(
    () => parseDescriptionRows(description),
    [description]
  );

  const updateDescription = React.useCallback(
    (nextDesc: string) => {
      editor.tf.setNodes(
        { description: nextDesc } as any,
        { at: element }
      );
    },
    [editor, element]
  );

  const updateDescriptionMode = React.useCallback(
    (nextMode: DescriptionDisplayMode) => {
      editor.tf.setNodes(
        { descriptionMode: nextMode } as any,
        { at: element }
      );
    },
    [editor, element]
  );

  const formulaVarsLatex = React.useMemo(
    () => extractFormulaVariablesLatex(texExpression),
    [texExpression]
  );

  const commitDescRows = React.useCallback(
    (nextRows: DescriptionRowItem[], style = activeListStyle) => {
      updateDescription(serializeDescriptionRows(style, nextRows));
    },
    [activeListStyle, updateDescription]
  );

  const handleApplyListStyle = (style: DescriptionListStyle) => {
    setActiveListStyle(style);
    if (descRows.length === 0) {
      const initialRows =
        formulaVarsLatex.length > 0
          ? formulaVarsLatex.map((v) => ({ lhs: v, rhs: '' }))
          : [{ lhs: '\\alpha', rhs: '' }];
      commitDescRows(initialRows, style);
      setEditingRhsIdx(0);
    } else {
      commitDescRows(descRows, style);
    }
  };

  const handleUpdateRow = (idx: number, patch: Partial<DescriptionRowItem>) => {
    const next = descRows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    commitDescRows(next);
  };

  const handleAddRow = (afterIdx?: number) => {
    const usedVars = new Set(descRows.map((r) => r.lhs.trim()));
    const nextUnusedVar = formulaVarsLatex.find((v) => !usedVars.has(v)) ?? '';
    const newRow: DescriptionRowItem = { lhs: nextUnusedVar, rhs: '' };
    const insertAt =
      afterIdx !== undefined ? afterIdx + 1 : descRows.length;
    const next = [
      ...descRows.slice(0, insertAt),
      newRow,
      ...descRows.slice(insertAt),
    ];
    commitDescRows(next);
    if (nextUnusedVar) {
      setEditingRhsIdx(insertAt);
      setEditingLhsIdx(null);
    } else {
      setEditingLhsIdx(insertAt);
      setEditingRhsIdx(null);
    }
  };

  const handleRemoveRow = (idx: number) => {
    const next = descRows.filter((_, i) => i !== idx);
    commitDescRows(next);
    if (editingLhsIdx === idx) setEditingLhsIdx(null);
    if (editingRhsIdx === idx) setEditingRhsIdx(null);
  };

  const handleAutoFillVariables = () => {
    const existingLhs = new Set(descRows.map((r) => r.lhs.trim()));
    const missing = formulaVarsLatex.filter((v) => !existingLhs.has(v));
    const toAdd = (missing.length > 0 ? missing : formulaVarsLatex).map(
      (v) => ({ lhs: v, rhs: '' })
    );
    const next = [...descRows, ...toAdd];
    commitDescRows(next);
    setEditingRhsIdx(descRows.length);
  };

  const initialSnapshotRef = React.useRef({
    texExpression,
    description,
    descriptionMode,
  });

  const onClose = React.useCallback(() => {
    setOpen(false);
    if (isInline) {
      editor.tf.select(element, { focus: true, next: true });
    } else if (element.id) {
      editor
        .getApi(BlockSelectionPlugin)
        .blockSelection.set(element.id as string);
    }
  }, [editor, element, isInline, setOpen]);

  const onCancel = React.useCallback(() => {
    editor.tf.setNodes(
      initialSnapshotRef.current as any,
      { at: element }
    );
    onClose();
  }, [editor, element, onClose]);

  const closeRef = React.useRef(onCancel);
  closeRef.current = onCancel;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, []);

  const selectTokenAndResetSession = React.useCallback(
    (nextId: number, currentTex = texExpression) => {
      const nextTokens = tokenizeLatex(currentTex);
      if (nextTokens.length === 0) {
        setSelectedTokenId(0);
        setSession(null);
        setDraftValue('');
        return;
      }
      const safeId = Math.min(Math.max(0, nextId), nextTokens.length - 1);
      const nextSession = createTokenEditSession(
        currentTex,
        nextTokens,
        safeId
      );
      setSelectedTokenId(safeId);
      setSession(nextSession);
      const disp = nextTokens[safeId]?.display ?? '';
      setDraftValue(disp === '□' ? '' : disp);
      window.requestAnimationFrame(() => {
        valueInputRef.current?.focus();
        valueInputRef.current?.select();
      });
    },
    [setSelectedTokenId, texExpression]
  );

  React.useEffect(() => {
    if (!open) return;
    const currentTokens = tokenizeLatex(texExpression);
    if (currentTokens.length === 0) {
      setSession(null);
      setDraftValue('');
      setTab('templates');
      return;
    }
    const safeId = Math.min(
      Math.max(0, selectedTokenId),
      currentTokens.length - 1
    );
    const nextSession = createTokenEditSession(
      texExpression,
      currentTokens,
      safeId
    );
    setSession(nextSession);
    const disp = currentTokens[safeId]?.display ?? '';
    setDraftValue(disp === '□' ? '' : disp);
    const timer = window.setTimeout(() => {
      valueInputRef.current?.focus();
      valueInputRef.current?.select();
    }, 25);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedTokenId, selectionTick]);

  if (readOnly || typeof document === 'undefined') return null;

  const applyDraftChange = (
    nextDraft: string,
    overrideSyncAll = syncAllMatching
  ) => {
    setDraftValue(nextDraft);
    const activeSess =
      session ?? createTokenEditSession(texExpression, tokens, clampedTokenId);
    if (!activeSess) {
      updateTexExpression(nextDraft);
      return;
    }
    const nextTex = applySessionInput(activeSess, nextDraft, overrideSyncAll);
    updateTexExpression(nextTex);
  };

  const stepNumberValue = (delta: number) => {
    const normalized = (draftValue || '0').replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    if (Number.isNaN(parsed)) return;
    const usesComma = draftValue.includes(',');
    const rounded = Math.round((parsed + delta) * 1000) / 1000;
    const formatted = usesComma
      ? String(rounded).replace('.', ',')
      : String(rounded);
    applyDraftChange(formatted);
  };

  const isNumericDraft =
    activeToken?.kind === 'number' ||
    /^-?\d+(?:[.,]\d+)?$/.test(draftValue.trim());

  const handleInsertStructure = (latexTemplate: string) => {
    let nextTex: string;
    if (activeToken && activeToken.kind === 'placeholder') {
      nextTex =
        texExpression.slice(0, activeToken.start) +
        latexTemplate +
        texExpression.slice(activeToken.end);
    } else if (!texExpression.trim()) {
      nextTex = latexTemplate;
    } else {
      nextTex = `${texExpression.trim()} ${latexTemplate}`;
    }
    updateTexExpression(nextTex);
    const nextTokens = tokenizeLatex(nextTex);
    const firstPlaceholder = nextTokens.findIndex(
      (t) => t.kind === 'placeholder'
    );
    selectTokenAndResetSession(
      firstPlaceholder >= 0
        ? firstPlaceholder
        : Math.max(0, nextTokens.length - 1),
      nextTex
    );
  };

  const handleWrapSelected = (
    structure: 'fraction' | 'power' | 'subscript' | 'sqrt' | 'parens'
  ) => {
    if (!activeToken) return;
    const nextTex = wrapTokenWithStructure(
      texExpression,
      tokens,
      clampedTokenId,
      structure
    );
    updateTexExpression(nextTex);
    const nextTokens = tokenizeLatex(nextTex);
    const placeholderIdx = nextTokens.findIndex(
      (t) => t.kind === 'placeholder' && t.start >= activeToken.start
    );
    selectTokenAndResetSession(
      placeholderIdx >= 0 ? placeholderIdx : clampedTokenId,
      nextTex
    );
  };

  const tabs: [EquationDialogTab, string, React.ReactNode][] = [
    ['visual', 'Visual Editor', <PencilIcon key="v" className="size-3.5" />],
    [
      'templates',
      'Formula Templates',
      <BookTemplateIcon key="t" className="size-3.5" />,
    ],
    ['latex', 'LaTeX Code', <Code2Icon key="l" className="size-3.5" />],
  ];

  return createPortal(
    <div
      className="dlg-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dlgRef}
        className="dlg dlg-formula"
        role="dialog"
        aria-modal="true"
        aria-label="Formula Editor"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            closeRef.current();
          }
          e.stopPropagation();
        }}
      >
        {/* Dialog Header — matches FigureDialog */}
        <header className="dlg-head">
          <div className="dlg-title flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-md bg-blue-50 text-blue-700">
              <RadicalIcon className="size-4" />
            </span>
            <span>{isInline ? 'Inline Formula Editor' : 'Formula Editor'}</span>
          </div>

          <nav className="dlg-tabs" role="tablist">
            {tabs.map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={cn(
                  'inline-flex items-center gap-1.5',
                  tab === id ? 'on' : ''
                )}
                onClick={() => setTab(id)}
              >
                {icon}
                {label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            {!isInline && (
              <button
                type="button"
                className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50/70 px-2.5 text-xs font-medium whitespace-nowrap text-[#1d5fd1] transition-colors hover:bg-blue-100/80"
                data-tip="Ask AI to write or modify this formula"
                onClick={() => {
                  onClose();
                  window.setTimeout(() => {
                    openAIChatOnElement(editor, element);
                  }, 40);
                }}
              >
                <SparklesIcon className="size-3.5 shrink-0" />
                <span>Ask AI</span>
              </button>
            )}
            <Button
              variant="default"
              size="sm"
              className="h-7 bg-blue-600 px-3 text-xs text-white hover:bg-blue-700"
              onClick={onClose}
            >
              Done
            </Button>
            <button
              type="button"
              className="pc-icon-btn"
              aria-label="Cancel and close"
              onClick={onCancel}
            >
              <XIcon size={17} />
            </button>
          </div>
        </header>

        {/* Dialog Body */}
        <div className="dlg-body flex flex-col gap-3 bg-slate-50/50 p-3 sm:gap-4 sm:p-5">
          {/* 1. Unified Interactive Formula & Variable Notes Stage */}
          <div className="rounded-xl border bg-white p-3 shadow-2xs sm:p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-medium">
                Interactive Formula Preview — click any number, symbol, or variable to edit it directly:
              </span>
              <div className="flex items-center gap-2">
                {tokens.length > 0 && (
                  <span>
                    Part {clampedTokenId + 1} of {tokens.length}
                  </span>
                )}
                {!isInline && (
                  <div
                    className="inline-flex rounded-lg border bg-slate-100/80 p-0.5 text-xs"
                    role="group"
                    aria-label="Variable notes display mode"
                  >
                    {(
                      [
                        { id: 'inline', label: 'Show Below Formula' },
                        { id: 'popup', label: 'Popup Only' },
                        { id: 'none', label: 'Off (Use Text Cell)' },
                      ] as const
                    ).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => updateDescriptionMode(mode.id)}
                        className={cn(
                          'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
                          descriptionMode === mode.id
                            ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex min-h-[110px] flex-col items-center justify-center overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/70 px-6 py-5">
              {texExpression.trim().length > 0 ? (
                <InteractiveKatexSurface
                  texExpression={texExpression}
                  tokens={tokens}
                  activeTokenId={activeToken ? clampedTokenId : null}
                  highlightAllSame={syncAllMatching}
                  displayMode
                  className="text-[1.45rem]"
                  onSelectToken={(id) => {
                    selectTokenAndResetSession(id);
                  }}
                />
              ) : (
                <div className="text-sm text-muted-foreground">
                  Empty formula — pick a template below or insert a structure to start
                </div>
              )}

              {/* Direct Click-to-Edit KaTeX Variable Notes inside the same Formula Stage */}
              {!isInline && descriptionMode !== 'none' && (
                <div
                  className="mt-3 w-full text-left"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="mr-1 text-[11px] font-medium text-muted-foreground">
                        Index style:
                      </span>
                      {(
                        [
                          { id: 'bullet', label: '• Disc' },
                          { id: 'circle', label: '◦ Circle' },
                          { id: 'square', label: '▪ Square' },
                          { id: 'number', label: '1, 2, 3' },
                          { id: 'alpha', label: 'a, b, c' },
                        ] as const
                      ).map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => handleApplyListStyle(st.id)}
                          className={cn(
                            'inline-flex h-6 items-center gap-1 rounded border px-2 text-[11px] font-medium transition-colors',
                            activeListStyle === st.id
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-foreground hover:border-slate-400'
                          )}
                          title={`Use ${st.label} markers`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAddRow()}
                        className="inline-flex h-6 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] font-medium text-foreground hover:bg-slate-100"
                      >
                        <PlusIcon className="size-3" /> Add Line
                      </button>
                      {formulaVarsLatex.length > 0 && (
                        <button
                          type="button"
                          onClick={handleAutoFillVariables}
                          className="inline-flex h-6 items-center gap-1 rounded border border-dashed border-blue-400 bg-blue-50/70 px-2 text-[11px] font-medium text-blue-700 hover:bg-blue-100/80"
                          title="Auto-populate rows from variables in the formula"
                        >
                          <PlusIcon className="size-3" /> Auto-list Variables (
                          {formulaVarsLatex.length})
                        </button>
                      )}
                    </div>
                  </div>

                  {descRows.length > 0 ? (
                    <div className="space-y-1.5">
                      {descRows.map((row, idx) => (
                        <div
                          key={idx}
                          className="group/row flex items-center gap-2 text-xs leading-relaxed"
                        >
                          <BlackListMarker
                            style={activeListStyle}
                            index={idx}
                          />

                          {/* Clickable KaTeX Variable / Symbol Pill */}
                          {editingLhsIdx === idx ? (
                            <input
                              type="text"
                              autoFocus
                              value={row.lhs}
                              placeholder="\alpha"
                              onChange={(e) =>
                                handleUpdateRow(idx, { lhs: e.target.value })
                              }
                              onBlur={() => setEditingLhsIdx(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'Tab') {
                                  e.preventDefault();
                                  setEditingLhsIdx(null);
                                  setEditingRhsIdx(idx);
                                }
                              }}
                              className="h-6 w-32 rounded border border-blue-500 bg-white px-2 font-mono text-xs text-foreground outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLhsIdx(idx);
                                setEditingRhsIdx(null);
                              }}
                              title="Click to edit LaTeX symbol"
                              className="inline-flex min-h-[24px] shrink-0 items-center rounded px-1 py-0.5 hover:bg-blue-50/70 hover:ring-1 hover:ring-blue-300"
                            >
                              {row.lhs.trim() ? (
                                <span
                                  dangerouslySetInnerHTML={{
                                    __html: renderMiniKatex(row.lhs.trim()),
                                  }}
                                />
                              ) : (
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  + symbol
                                </span>
                              )}
                            </button>
                          )}

                          <span className="select-none text-muted-foreground">
                            —
                          </span>

                          {/* Click-to-edit Explanation (renders $...$ KaTeX when not focused) */}
                          {editingRhsIdx === idx || !row.rhs.trim() ? (
                            <input
                              type="text"
                              autoFocus={editingRhsIdx === idx}
                              value={row.rhs}
                              placeholder="Type explanation (use $...$ for inline LaTeX math, e.g. $^\circ\text{C}$)…"
                              onFocus={() => setEditingRhsIdx(idx)}
                              onBlur={() => {
                                if (editingRhsIdx === idx) {
                                  setEditingRhsIdx(null);
                                }
                              }}
                              onChange={(e) =>
                                handleUpdateRow(idx, { rhs: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (idx < descRows.length - 1) {
                                    setEditingRhsIdx(idx + 1);
                                  } else {
                                    handleAddRow(idx);
                                  }
                                }
                              }}
                              className="h-7 min-w-0 flex-1 rounded border border-slate-300 bg-white px-2.5 text-xs text-foreground outline-none focus:border-blue-500"
                            />
                          ) : (
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setEditingRhsIdx(idx);
                                setEditingLhsIdx(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setEditingRhsIdx(idx);
                                }
                              }}
                              title="Click to edit explanation"
                              className="min-w-0 flex-1 cursor-text rounded px-2 py-1 text-foreground/95 transition-colors hover:bg-white hover:ring-1 hover:ring-blue-300"
                            >
                              {renderInlineSegmentWithKatex(row.rhs)}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoveRow(idx)}
                            className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-slate-200/70 hover:text-foreground group-hover/row:opacity-100"
                            title="Remove line"
                          >
                            <XIcon className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-md border border-dashed border-slate-300 bg-white/60 px-3 py-2 text-xs text-muted-foreground">
                      <span>
                        No variable explanations yet — click &ldquo;Auto-list Variables&rdquo; to generate rows from this formula.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Clickable Token Strip: every part in reading order so even tiny subscripts are easy to select */}
            {tokens.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1 border-t pt-2.5">
                <span className="mr-1.5 text-[11px] font-medium text-muted-foreground">
                  Formula parts:
                </span>
                {tokens.map((tok) => {
                  const isCurrent = tok.id === clampedTokenId;
                  const isSame =
                    syncAllMatching &&
                    activeToken &&
                    !isCurrent &&
                    tok.raw === activeToken.raw;
                  return (
                    <button
                      key={tok.id}
                      type="button"
                      onClick={() => selectTokenAndResetSession(tok.id)}
                      className={cn(
                        'inline-flex h-6 min-w-[26px] items-center justify-center rounded-md border px-2 font-serif text-xs transition-all',
                        isCurrent
                          ? 'border-blue-600 bg-blue-600 font-semibold text-white shadow-2xs'
                          : isSame
                            ? 'border-blue-400 border-dashed bg-blue-50 text-blue-800'
                            : tok.kind === 'placeholder'
                              ? 'border-amber-400 border-dashed bg-amber-50 text-amber-800'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/50'
                      )}
                      title={`${TOKEN_KIND_LABEL[tok.kind]}: ${tok.raw}`}
                    >
                      {tok.display}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Direct Selected Part Editor Bar (Separated cleanly below preview) */}
          {activeToken && (
            <div className="rounded-xl border border-blue-200/80 bg-white p-3.5 shadow-2xs space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="shrink-0 rounded-md bg-blue-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-800">
                  {TOKEN_KIND_LABEL[activeToken.kind]}
                </span>

                <input
                  ref={valueInputRef}
                  type="text"
                  value={draftValue}
                  onChange={(e) => applyDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const nextIdx = e.shiftKey
                        ? Math.max(0, clampedTokenId - 1)
                        : Math.min(tokens.length - 1, clampedTokenId + 1);
                      selectTokenAndResetSession(nextIdx);
                    } else if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      onClose();
                    } else if (e.key === 'ArrowUp' && isNumericDraft) {
                      e.preventDefault();
                      stepNumberValue(e.shiftKey ? 1 : 0.1);
                    } else if (e.key === 'ArrowDown' && isNumericDraft) {
                      e.preventDefault();
                      stepNumberValue(e.shiftKey ? -1 : -0.1);
                    }
                  }}
                  placeholder="Type number, variable, or LaTeX…"
                  className="h-9 min-w-[160px] flex-1 rounded-lg border border-blue-400 bg-background px-3 font-serif text-base font-semibold text-foreground outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20"
                />

                {isNumericDraft && (
                  <div className="flex shrink-0 items-center gap-1">
                    {([-1, -0.1, 0.1, 1] as const).map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => stepNumberValue(step)}
                        className="h-9 rounded-lg border bg-slate-50 px-2.5 font-mono text-xs font-medium text-foreground hover:bg-blue-50 hover:border-blue-300"
                        title={`Step ${step > 0 ? `+${step}` : step} (or use Up/Down arrows)`}
                      >
                        {step > 0 ? `+${step}` : step}
                      </button>
                    ))}
                  </div>
                )}

                {session && session.matchCount > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextSync = !syncAllMatching;
                      setSyncAllMatching(nextSync);
                      applyDraftChange(draftValue, nextSync);
                    }}
                    className={cn(
                      'h-9 rounded-lg border px-2.5 text-xs font-medium transition-colors',
                      syncAllMatching
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-blue-200 bg-blue-50/70 text-blue-700 hover:bg-blue-100'
                    )}
                    title="Update all identical occurrences in this formula at the same time"
                  >
                    Sync all {session.matchCount} &ldquo;{session.originalDisplay}&rdquo;
                  </button>
                )}

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={clampedTokenId <= 0}
                    onClick={() => selectTokenAndResetSession(clampedTokenId - 1)}
                    className="flex size-9 items-center justify-center rounded-lg border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-35"
                    title="Previous part (Shift+Tab)"
                  >
                    <ChevronLeftIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={clampedTokenId >= tokens.length - 1}
                    onClick={() => selectTokenAndResetSession(clampedTokenId + 1)}
                    className="flex size-9 items-center justify-center rounded-lg border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-35"
                    title="Next part (Tab)"
                  >
                    <ChevronRightIcon className="size-4" />
                  </button>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="h-9 gap-1 px-3 text-xs"
                  onClick={onClose}
                  title="Finish editing (Enter)"
                >
                  <CornerDownLeftIcon className="size-3.5" />
                  Apply
                </Button>
              </div>

              {/* Quick Replacement & Structure Conversion Row */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[11px] font-medium text-muted-foreground mr-1">
                  Quick replace:
                </span>
                {(activeToken.kind === 'operator'
                  ? COMMON_OPERATOR_PALETTE.slice(0, 12)
                  : [
                      ...COMMON_GREEK_PALETTE.slice(0, 8),
                      ...COMMON_VARIABLE_PALETTE.slice(0, 6),
                    ]
                ).map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => applyDraftChange(sym)}
                    className={cn(
                      'inline-flex h-6 min-w-[26px] items-center justify-center rounded border px-1.5 font-serif text-xs transition-colors',
                      draftValue === sym
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'bg-slate-50 text-foreground hover:border-blue-300 hover:bg-blue-50'
                    )}
                  >
                    {sym}
                  </button>
                ))}

                {activeToken.kind !== 'operator' && (
                  <>
                    <span className="mx-1 text-border">|</span>
                    <span className="text-[11px] font-medium text-muted-foreground mr-1">
                      Convert selected into:
                    </span>
                    {(
                      [
                        { id: 'fraction', label: 'a/b Fraction' },
                        { id: 'power', label: 'xⁿ Power' },
                        { id: 'subscript', label: 'xᵢ Subscript' },
                        { id: 'sqrt', label: '√x Root' },
                        { id: 'parens', label: '(x) Parens' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleWrapSelected(item.id)}
                        className="h-6 rounded border bg-slate-100/80 px-2 font-serif text-xs font-medium text-foreground hover:border-blue-300 hover:bg-blue-50"
                      >
                        {item.label}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* 3. Tab Content */}
          {tab === 'visual' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              {/* Left 7 cols: Structures, Greek, Operators */}
              <div className="rounded-xl border bg-white p-3.5 shadow-2xs lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-1">
                    {(
                      [
                        { id: 'structures', label: 'Math Structures' },
                        { id: 'greek', label: 'Greek & Variables' },
                        { id: 'operators', label: 'Operators & Relations' },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPaletteTab(p.id)}
                        className={cn(
                          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                          paletteTab === p.id
                            ? 'bg-blue-50 text-blue-700 font-semibold'
                            : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground'
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleInsertStructure('\\\\ ')}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      title="Break formula onto a new line (inserts \\)"
                    >
                      <CornerDownLeftIcon className="size-3.5" /> New Line
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertStructure('\\square')}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-blue-400 bg-blue-50/50 px-2.5 text-xs font-medium text-blue-700 hover:bg-blue-100/70"
                      title="Append an editable placeholder slot □ to the formula"
                    >
                      <PlusIcon className="size-3.5" /> Add Slot □
                    </button>
                  </div>
                </div>

                {paletteTab === 'structures' && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {STRUCTURE_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleInsertStructure(tpl.latex)}
                        className="flex items-center justify-between rounded-lg border bg-slate-50/60 px-3 py-2 text-left text-xs transition-colors hover:border-blue-300 hover:bg-blue-50/50"
                      >
                        <span className="font-medium text-foreground">
                          {tpl.label}
                        </span>
                        <span
                          className="text-sm"
                          dangerouslySetInnerHTML={{
                            __html: renderMiniKatex(tpl.preview),
                          }}
                        />
                      </button>
                    ))}
                  </div>
                )}

                {paletteTab === 'greek' && (
                  <div className="space-y-2.5">
                    <div>
                      <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                        Greek Letters (click to replace selected part or append)
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {COMMON_GREEK_PALETTE.map((sym) => (
                          <button
                            key={sym}
                            type="button"
                            onClick={() =>
                              activeToken
                                ? applyDraftChange(sym)
                                : handleInsertStructure(sym)
                            }
                            className="inline-flex h-8 min-w-[34px] items-center justify-center rounded-md border bg-slate-50 px-2 font-serif text-sm hover:border-blue-300 hover:bg-blue-50"
                          >
                            {sym}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                        Common Variables
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {COMMON_VARIABLE_PALETTE.map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() =>
                              activeToken
                                ? applyDraftChange(v)
                                : handleInsertStructure(v)
                            }
                            className="inline-flex h-8 min-w-[34px] items-center justify-center rounded-md border bg-slate-50 px-2 font-serif text-sm italic hover:border-blue-300 hover:bg-blue-50"
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {paletteTab === 'operators' && (
                  <div className="flex flex-wrap gap-1.5">
                    {COMMON_OPERATOR_PALETTE.map((op) => (
                      <button
                        key={op}
                        type="button"
                        onClick={() =>
                          activeToken
                            ? applyDraftChange(op)
                            : handleInsertStructure(op)
                        }
                        className="inline-flex h-8 min-w-[36px] items-center justify-center rounded-md border bg-slate-50 px-2 font-serif text-sm hover:border-blue-300 hover:bg-blue-50"
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right 5 cols: Live LaTeX Source */}
              <div className="flex flex-col rounded-xl border bg-white p-3.5 shadow-2xs lg:col-span-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Live LaTeX Source
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Synced in real time
                  </span>
                </div>
                <textarea
                  value={texExpression}
                  onChange={(e) => updateTexExpression(e.target.value)}
                  placeholder={placeholder || 'f(d) = \\frac{1}{\\mu} e^{-d/\\mu}'}
                  rows={5}
                  className="w-full flex-1 resize-none rounded-lg border bg-slate-50/70 p-2.5 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>
            </div>
          )}

          {tab === 'templates' && (
            <div className="rounded-xl border bg-white p-4 shadow-2xs">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Pre-built Scientific &amp; Statistical Formula Templates (click any template to load and edit its numbers):
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {FORMULA_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      updateTexExpression(tpl.latex);
                      selectTokenAndResetSession(0, tpl.latex);
                      setTab('visual');
                    }}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50/50 px-3.5 py-2.5 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-foreground">
                        {tpl.label}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {tpl.hint}
                      </div>
                    </div>
                    <span
                      className="shrink-0 text-sm"
                      dangerouslySetInnerHTML={{
                        __html: renderMiniKatex(tpl.latex),
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'latex' && (
            <div className="rounded-xl border bg-white p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Raw LaTeX Expression
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Supports KaTeX environments (\begin&#123;cases&#125;, \begin&#123;pmatrix&#125;, \frac, \sum, \int, etc.)
                </span>
              </div>
              <textarea
                value={texExpression}
                onChange={(e) => updateTexExpression(e.target.value)}
                placeholder={placeholder}
                rows={8}
                autoFocus
                className="w-full resize-y rounded-lg border bg-slate-50/60 p-3 font-mono text-sm leading-relaxed text-foreground outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
