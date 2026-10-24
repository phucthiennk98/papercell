import * as React from 'react';

import type { TEquationElement } from 'platejs';
import type { SlateElementProps } from 'platejs/static';

import { getEquationHtml } from '@platejs/math';
import { RadicalIcon } from 'lucide-react';
import { SlateElement } from 'platejs/static';

import { cn } from '@/lib/utils';
import { inlineSuggestionVariants } from '@/lib/suggestion';
import { renderMiniKatex } from './equation-visual';

const STATIC_LIST_RE = /^(?:([•\-*])|([◦○])|([▪■□])|(\d+[.)])|([a-zA-Z][.)]))\s+(.*)$/;

function StaticFormulaDescription({ text }: { text: string }) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <div className="space-y-1.5 text-xs text-foreground">
      {lines.map((line, idx) => {
        const m = STATIC_LIST_RE.exec(line);
        const marker = m ? (m[1] ? '•' : m[2] ? '◦' : m[3] ? '▪' : m[4] || m[5] || '') : '';
        const body = m ? m[6] : line;
        const explicitMatch = /^\$([^$]+)\$\s*(?::|—|–|-)\s*(.*)$/.exec(body);
        const lhsLatex = explicitMatch ? explicitMatch[1].trim() : null;
        const rhsText = explicitMatch ? explicitMatch[2] : body;
        const parts = rhsText.split(/(\$[^$]+\$)/g);
        return (
          <div key={idx} className="flex items-baseline gap-2 leading-relaxed break-words">
            {marker &&
              (marker === '•' ? (
                <span className="inline-flex w-3.5 shrink-0 select-none items-center justify-center self-center">
                  <span
                    className="inline-block rounded-full bg-slate-950"
                    style={{ width: 3.5, height: 3.5 }}
                  />
                </span>
              ) : marker === '◦' ? (
                <span className="inline-flex w-3.5 shrink-0 select-none items-center justify-center self-center">
                  <span
                    className="inline-block rounded-full border border-slate-950 bg-transparent"
                    style={{ width: 4, height: 4 }}
                  />
                </span>
              ) : marker === '▪' ? (
                <span className="inline-flex w-3.5 shrink-0 select-none items-center justify-center self-center">
                  <span
                    className="inline-block bg-slate-950"
                    style={{ width: 3.5, height: 3.5 }}
                  />
                </span>
              ) : (
                <span className="min-w-[1.25rem] shrink-0 select-none text-right font-semibold text-slate-950">
                  {marker}
                </span>
              ))}
            <div className="min-w-0 flex-1">
              {lhsLatex && (
                <>
                  <span
                    className="inline-block align-baseline"
                    dangerouslySetInnerHTML={{ __html: renderMiniKatex(lhsLatex) }}
                  />
                  <span className="mx-1.5 text-muted-foreground">—</span>
                </>
              )}
              <span className="text-foreground/90">
                {parts.map((part, pIdx) =>
                  part.startsWith('$') && part.endsWith('$') && part.length > 2 ? (
                    <span
                      key={pIdx}
                      className="mx-0.5 inline-block align-baseline"
                      dangerouslySetInnerHTML={{ __html: renderMiniKatex(part.slice(1, -1)) }}
                    />
                  ) : (
                    <React.Fragment key={pIdx}>{part}</React.Fragment>
                  )
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EquationElementStatic(
  props: SlateElementProps<TEquationElement>
) {
  const { element } = props;
  const texExpression =
    typeof element.texExpression === 'string' ||
    typeof element.texExpression === 'number' ||
    typeof element.texExpression === 'boolean'
      ? String(element.texExpression)
      : '';

  const description =
    typeof (element as any).description === 'string'
      ? (element as any).description
      : '';
  const descriptionMode =
    (element as any).descriptionMode === 'none' ||
    (element as any).descriptionMode === 'popup' ||
    (element as any).descriptionMode === 'inline'
      ? (element as any).descriptionMode
      : 'inline';

  const normalizedTex =
    (texExpression.includes('\\\\') || texExpression.includes('\\newline')) &&
    !/\\begin\s*\{/.test(texExpression)
      ? `\\begin{gathered}${texExpression}\\end{gathered}`
      : texExpression;

  const html = getEquationHtml({
    element: { ...element, texExpression: normalizedTex },
    options: {
      displayMode: true,
      errorColor: '#cc0000',
      fleqn: false,
      leqno: false,
      macros: { '\\f': '#1f(#2)' },
      output: 'htmlAndMathml',
      strict: 'warn',
      throwOnError: false,
      trust: false,
    },
  });

  return (
    <SlateElement className="my-1" {...props}>
      <div
        className={cn(
          'group flex max-w-full select-none flex-col items-center justify-center overflow-hidden rounded-sm hover:bg-primary/10 data-[selected=true]:bg-primary/10',
          texExpression.length === 0 ? 'bg-muted p-3 pr-9' : 'px-2 py-1'
        )}
      >
        {texExpression.length > 0 ? (
          <>
            <span
              dangerouslySetInnerHTML={{
                __html: html,
              }}
            />
            {descriptionMode === 'inline' && description.trim().length > 0 && (
              <div className="mt-2 w-full text-left">
                <StaticFormulaDescription text={description.trim()} />
              </div>
            )}
          </>
        ) : (
          <div className="flex h-7 w-full items-center gap-2 whitespace-nowrap text-muted-foreground text-sm">
            <RadicalIcon className="size-6 text-muted-foreground/80" />
            <div>Add a Tex equation</div>
          </div>
        )}
      </div>
      {props.children}
    </SlateElement>
  );
}

export function InlineEquationElementStatic(
  props: SlateElementProps<TEquationElement>
) {
  const texExpression =
    typeof props.element.texExpression === 'string' ||
    typeof props.element.texExpression === 'number' ||
    typeof props.element.texExpression === 'boolean'
      ? String(props.element.texExpression)
      : '';
  const html = getEquationHtml({
    element: props.element,
    options: {
      displayMode: true,
      errorColor: '#cc0000',
      fleqn: false,
      leqno: false,
      macros: { '\\f': '#1f(#2)' },
      output: 'htmlAndMathml',
      strict: 'warn',
      throwOnError: false,
      trust: false,
    },
  });

  return (
    <SlateElement
      {...props}
      className="inline-block select-none rounded-sm [&_.katex-display]:my-0"
    >
      <div
        className={cn(
          'after:-top-0.5 after:-left-1 after:absolute after:inset-0 after:z-1 after:h-[calc(100%)+4px] after:w-[calc(100%+8px)] after:rounded-sm after:content-[""]',
          'h-6',
          inlineSuggestionVariants(),
          texExpression.length === 0 &&
            'text-muted-foreground after:bg-neutral-500/10'
        )}
      >
        <span
          className={cn(
            texExpression.length === 0 && 'hidden',
            'font-mono leading-none'
          )}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      {props.children}
    </SlateElement>
  );
}

/**
 * DOCX-compatible block equation component.
 * Displays LaTeX source code with styling.
 */
export function EquationElementDocx(
  props: SlateElementProps<TEquationElement>
) {
  const { element } = props;
  const texExpression =
    typeof element.texExpression === 'string' ||
    typeof element.texExpression === 'number' ||
    typeof element.texExpression === 'boolean'
      ? String(element.texExpression)
      : '';

  if (!texExpression) {
    return (
      <SlateElement {...props}>
        <p style={{ color: '#888', fontStyle: 'italic' }}>[Empty equation]</p>
        {props.children}
      </SlateElement>
    );
  }

  return (
    <SlateElement {...props}>
      <p
        style={{
          fontFamily: 'Cambria Math, Consolas, monospace',
          fontSize: '12pt',
          margin: '8pt 0',
          textAlign: 'center',
        }}
      >
        {texExpression}
      </p>
      {props.children}
    </SlateElement>
  );
}

/**
 * DOCX-compatible inline equation component.
 * Displays LaTeX source code inline.
 */
export function InlineEquationElementDocx(
  props: SlateElementProps<TEquationElement>
) {
  const { element } = props;
  const texExpression =
    typeof element.texExpression === 'string' ||
    typeof element.texExpression === 'number' ||
    typeof element.texExpression === 'boolean'
      ? String(element.texExpression)
      : '';

  if (!texExpression) {
    return (
      <SlateElement {...props} as="span">
        <span style={{ color: '#888', fontStyle: 'italic' }}>[equation]</span>
        {props.children}
      </SlateElement>
    );
  }

  return (
    <SlateElement {...props} as="span">
      <span
        style={{
          fontFamily: 'Cambria Math, Consolas, monospace',
        }}
      >
        {texExpression}
      </span>
      {props.children}
    </SlateElement>
  );
}
