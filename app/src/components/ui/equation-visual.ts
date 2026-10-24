import katex from 'katex';

export type MathTokenKind =
  | 'number'
  | 'symbol'
  | 'variable'
  | 'operator'
  | 'placeholder';

export interface MathToken {
  id: number;
  start: number;
  end: number;
  raw: string;
  display: string;
  kind: MathTokenKind;
}

export const GREEK_AND_SYMBOLS: Record<string, string> = {
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\epsilon': 'ϵ',
  '\\varepsilon': 'ε',
  '\\zeta': 'ζ',
  '\\eta': 'η',
  '\\theta': 'θ',
  '\\vartheta': 'ϑ',
  '\\iota': 'ι',
  '\\kappa': 'κ',
  '\\lambda': 'λ',
  '\\mu': 'μ',
  '\\nu': 'ν',
  '\\xi': 'ξ',
  '\\pi': 'π',
  '\\rho': 'ρ',
  '\\sigma': 'σ',
  '\\tau': 'τ',
  '\\upsilon': 'υ',
  '\\phi': 'ϕ',
  '\\varphi': 'φ',
  '\\chi': 'χ',
  '\\psi': 'ψ',
  '\\omega': 'ω',
  '\\Gamma': 'Γ',
  '\\Delta': 'Δ',
  '\\Theta': 'Θ',
  '\\Lambda': 'Λ',
  '\\Xi': 'Ξ',
  '\\Pi': 'Π',
  '\\Sigma': 'Σ',
  '\\Phi': 'Φ',
  '\\Psi': 'Ψ',
  '\\Omega': 'Ω',
  '\\infty': '∞',
  '\\partial': '∂',
  '\\nabla': '∇',
  '\\ell': 'ℓ',
  '\\hbar': 'ℏ',
  '\\emptyset': '∅',
};

export const OPERATOR_MACROS: Record<string, string> = {
  '\\ge': '≥',
  '\\geq': '≥',
  '\\le': '≤',
  '\\leq': '≤',
  '\\neq': '≠',
  '\\ne': '≠',
  '\\approx': '≈',
  '\\sim': '∼',
  '\\simeq': '≃',
  '\\equiv': '≡',
  '\\propto': '∝',
  '\\pm': '±',
  '\\mp': '∓',
  '\\times': '×',
  '\\div': '÷',
  '\\cdot': '·',
  '\\to': '→',
  '\\rightarrow': '→',
  '\\leftarrow': '←',
  '\\Rightarrow': '⇒',
  '\\Leftarrow': '⇐',
  '\\leftrightarrow': '↔',
  '\\iff': '⇔',
  '\\in': '∈',
  '\\notin': '∉',
  '\\subset': '⊂',
  '\\subseteq': '⊆',
  '\\cup': '∪',
  '\\cap': '∩',
  '\\forall': '∀',
  '\\exists': '∃',
};

const FUNCTION_MACROS = new Set([
  '\\sin',
  '\\cos',
  '\\tan',
  '\\cot',
  '\\sec',
  '\\csc',
  '\\arcsin',
  '\\arccos',
  '\\arctan',
  '\\sinh',
  '\\cosh',
  '\\tanh',
  '\\ln',
  '\\log',
  '\\exp',
  '\\min',
  '\\max',
  '\\sup',
  '\\inf',
  '\\det',
  '\\dim',
  '\\ker',
  '\\Pr',
  '\\gcd',
]);

const SKIP_STRUCTURAL_MACROS = new Set([
  '\\frac',
  '\\dfrac',
  '\\tfrac',
  '\\cfrac',
  '\\binom',
  '\\sqrt',
  '\\sum',
  '\\prod',
  '\\int',
  '\\iint',
  '\\iiint',
  '\\oint',
  '\\lim',
  '\\mathrm',
  '\\mathbf',
  '\\mathit',
  '\\mathsf',
  '\\mathtt',
  '\\mathcal',
  '\\mathbb',
  '\\mathfrak',
  '\\mathscr',
  '\\boldsymbol',
  '\\bm',
  '\\operatorname',
  '\\hat',
  '\\bar',
  '\\vec',
  '\\tilde',
  '\\dot',
  '\\ddot',
  '\\overline',
  '\\underline',
  '\\widehat',
  '\\widetilde',
  '\\overbrace',
  '\\underbrace',
  '\\displaystyle',
  '\\textstyle',
  '\\scriptstyle',
  '\\scriptscriptstyle',
  '\\limits',
  '\\nolimits',
  '\\quad',
  '\\qquad',
  '\\enspace',
  '\\thinspace',
  '\\!',
  '\\,',
  '\\:',
  '\\;',
  '\\ ',
  '\\\\',
]);

const DISPLAY_TO_LATEX: Record<string, string> = {
  '□': '\\square',
  '−': '-',
  ...Object.fromEntries(
    Object.entries(GREEK_AND_SYMBOLS).map(([k, v]) => [v, k])
  ),
  ...Object.fromEntries(
    Object.entries(OPERATOR_MACROS).map(([k, v]) => [v, k])
  ),
  // Keep canonical short forms for common operators
  '≥': '\\ge',
  '≤': '\\le',
  '≠': '\\neq',
  '→': '\\to',
};

const WORD_SHORTHAND_TO_LATEX: Record<string, string> = {
  alpha: '\\alpha',
  beta: '\\beta',
  gamma: '\\gamma',
  delta: '\\delta',
  eps: '\\varepsilon',
  epsilon: '\\varepsilon',
  zeta: '\\zeta',
  eta: '\\eta',
  theta: '\\theta',
  kappa: '\\kappa',
  lambda: '\\lambda',
  mu: '\\mu',
  nu: '\\nu',
  xi: '\\xi',
  pi: '\\pi',
  rho: '\\rho',
  sigma: '\\sigma',
  tau: '\\tau',
  phi: '\\varphi',
  chi: '\\chi',
  psi: '\\psi',
  omega: '\\omega',
  Gamma: '\\Gamma',
  Delta: '\\Delta',
  Theta: '\\Theta',
  Lambda: '\\Lambda',
  Pi: '\\Pi',
  Sigma: '\\Sigma',
  Phi: '\\Phi',
  Psi: '\\Psi',
  Omega: '\\Omega',
  inf: '\\infty',
  infty: '\\infty',
  '>=': '\\ge',
  '<=': '\\le',
  '!=': '\\neq',
  '~=': '\\approx',
  '+-': '\\pm',
  '->': '\\to',
};

function skipBracedGroup(tex: string, pos: number): number {
  let i = pos;
  while (i < tex.length && /\s/.test(tex[i])) i++;
  if (tex[i] !== '{') return pos;
  let depth = 0;
  while (i < tex.length) {
    if (tex[i] === '\\') {
      i += 2;
      continue;
    }
    if (tex[i] === '{') depth++;
    else if (tex[i] === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return tex.length;
}

/**
 * Extracts interactive tokens (numbers, Greek symbols, variables, operators, placeholders)
 * with exact character offsets so clicking any part of the rendered equation can edit it in place.
 */
export function tokenizeLatex(tex: string): MathToken[] {
  const tokens: MathToken[] = [];
  let i = 0;

  const push = (
    start: number,
    end: number,
    display: string,
    kind: MathTokenKind
  ) => {
    tokens.push({
      id: tokens.length,
      start,
      end,
      raw: tex.slice(start, end),
      display,
      kind,
    });
  };

  while (i < tex.length) {
    const ch = tex[i];

    // Whitespace or structural braces/grouping
    if (
      /\s/.test(ch) ||
      ch === '{' ||
      ch === '}' ||
      ch === '(' ||
      ch === ')' ||
      ch === '[' ||
      ch === ']' ||
      ch === ',' ||
      ch === ';' ||
      ch === ':' ||
      ch === '&' ||
      ch === '^' ||
      ch === '_'
    ) {
      i++;
      continue;
    }

    // LaTeX commands starting with backslash
    if (ch === '\\') {
      if (i + 1 >= tex.length) {
        i++;
        continue;
      }

      const next = tex[i + 1];
      // Single non-letter escape like \, \; \! \\ \{ \}
      if (!/[a-zA-Z]/.test(next)) {
        i += 2;
        continue;
      }

      let end = i + 1;
      while (end < tex.length && /[a-zA-Z]/.test(tex[end])) end++;
      const cmd = tex.slice(i, end);

      // Skip \begin{...} and \end{...}
      if (cmd === '\\begin' || cmd === '\\end') {
        let after = skipBracedGroup(tex, end);
        if (cmd === '\\begin') {
          // Skip optional column alignment group e.g. \begin{array}{cc}
          after = skipBracedGroup(tex, after);
        }
        i = after;
        continue;
      }

      // Skip \left and \right plus their delimiter token
      if (cmd === '\\left' || cmd === '\\right') {
        let j = end;
        while (j < tex.length && /\s/.test(tex[j])) j++;
        if (tex[j] === '\\') {
          j++;
          while (j < tex.length && /[a-zA-Z]/.test(tex[j])) j++;
        } else if (j < tex.length) {
          j++;
        }
        i = j;
        continue;
      }

      // Text macros: allow editing the text inside \text{...} as a single token
      if (cmd === '\\text' || cmd === '\\mbox' || cmd === '\\hbox') {
        let j = end;
        while (j < tex.length && /\s/.test(tex[j])) j++;
        if (tex[j] === '{') {
          const groupEnd = skipBracedGroup(tex, j);
          const innerStart = j + 1;
          const innerEnd = Math.max(innerStart, groupEnd - 1);
          const innerText = tex.slice(innerStart, innerEnd);
          if (innerText.trim().length > 0) {
            push(innerStart, innerEnd, innerText, 'variable');
          }
          i = groupEnd;
          continue;
        }
      }

      if (cmd === '\\square' || cmd === '\\Box') {
        push(i, end, '□', 'placeholder');
        i = end;
        continue;
      }

      if (cmd in GREEK_AND_SYMBOLS) {
        push(i, end, GREEK_AND_SYMBOLS[cmd], 'symbol');
        i = end;
        continue;
      }

      if (cmd in OPERATOR_MACROS) {
        push(i, end, OPERATOR_MACROS[cmd], 'operator');
        i = end;
        continue;
      }

      if (FUNCTION_MACROS.has(cmd)) {
        push(i, end, cmd.slice(1), 'variable');
        i = end;
        continue;
      }

      if (SKIP_STRUCTURAL_MACROS.has(cmd)) {
        i = end;
        continue;
      }

      // Unknown macro: leave untouched so we never break custom LaTeX macros
      i = end;
      continue;
    }

    // Numbers: integers or decimals (e.g. 1, 0, 0.6, 0{,}6, 0,6 when followed by digit)
    if (/\d/.test(ch)) {
      let end = i + 1;
      while (end < tex.length && /\d/.test(tex[end])) end++;
      if (tex.slice(end, end + 3) === '{,}' && /\d/.test(tex[end + 3] || '')) {
        end += 3;
        while (end < tex.length && /\d/.test(tex[end])) end++;
      } else if (
        (tex[end] === '.' || tex[end] === ',') &&
        /\d/.test(tex[end + 1] || '')
      ) {
        end++;
        while (end < tex.length && /\d/.test(tex[end])) end++;
      }
      const rawNum = tex.slice(i, end);
      const displayNum = rawNum.replace('{,}', ',');
      push(i, end, displayNum, 'number');
      i = end;
      continue;
    }

    // Single-letter variable (f, d, e, x, y...)
    if (/[a-zA-Z]/.test(ch)) {
      push(i, i + 1, ch, 'variable');
      i++;
      continue;
    }

    // Operators (=, +, -, <, >, /)
    if (
      ch === '=' ||
      ch === '+' ||
      ch === '-' ||
      ch === '<' ||
      ch === '>' ||
      ch === '/'
    ) {
      push(i, i + 1, ch === '-' ? '−' : ch, 'operator');
      i++;
      continue;
    }

    i++;
  }

  return tokens;
}

function prevNonSpaceChar(tex: string, index: number): string {
  let i = index - 1;
  while (i >= 0 && /\s/.test(tex[i])) i--;
  return i >= 0 ? tex[i] : '';
}

/**
 * Renders the equation with KaTeX while attaching `data-eqtok="<id>"` to every editable token
 * so the user can hover and click numbers/symbols directly on the rendered formula.
 */
export function renderInteractiveKatex(
  tex: string,
  tokens: MathToken[],
  options: { displayMode?: boolean } = {}
): string {
  const displayMode = options.displayMode ?? true;
  if (!tex.trim()) return '';

  if (tokens.length > 0) {
    try {
      let instrumented = '';
      let cursor = 0;
      for (const tok of tokens) {
        instrumented += tex.slice(cursor, tok.start);
        const prev = prevNonSpaceChar(tex, tok.start);
        const wrapped = `\\htmlData{eqtok=${tok.id}}{${tok.raw}}`;
        // Keep operators unbraced (unless in a script) to preserve TeX mrel/mbin spacing; brace atoms so unbraced \sqrt x or x^2 always parse
        instrumented +=
          tok.kind !== 'operator' || prev === '^' || prev === '_'
            ? `{${wrapped}}`
            : wrapped;
        cursor = tok.end;
      }
      instrumented += tex.slice(cursor);

      return katex.renderToString(instrumented, {
        displayMode,
        errorColor: '#cc0000',
        fleqn: false,
        leqno: false,
        macros: { '\\f': '#1f(#2)' },
        output: 'htmlAndMathml',
        strict: false,
        throwOnError: true,
        trust: true,
      });
    } catch {
      // Fallback to standard KaTeX rendering below if a complex macro rejects \htmlData
    }
  }

  try {
    return katex.renderToString(tex, {
      displayMode,
      errorColor: '#cc0000',
      fleqn: false,
      leqno: false,
      macros: { '\\f': '#1f(#2)' },
      output: 'htmlAndMathml',
      strict: false,
      throwOnError: false,
      trust: true,
    });
  } catch {
    return tex;
  }
}

export function renderMiniKatex(tex: string): string {
  try {
    return katex.renderToString(tex, {
      displayMode: false,
      output: 'html',
      strict: false,
      throwOnError: false,
      trust: true,
    });
  } catch {
    return tex;
  }
}

/**
 * Converts friendly human input (e.g. "0.6", "0,6", "mu", "μ", ">=", "□") into valid LaTeX for a slot.
 */
export function userInputToLatex(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed === '□') {
    return '\\square';
  }
  if (trimmed in DISPLAY_TO_LATEX) {
    return DISPLAY_TO_LATEX[trimmed];
  }
  if (trimmed in WORD_SHORTHAND_TO_LATEX) {
    return WORD_SHORTHAND_TO_LATEX[trimmed];
  }
  // Decimal with comma e.g. "0,6" -> "0{,}6" so TeX doesn't add post-comma spacing
  if (/^\d+,\d+$/.test(trimmed)) {
    return trimmed.replace(',', '{,}');
  }
  // Replace inline Unicode math symbols if the user typed a compound expression like "-d/μ"
  let out = trimmed;
  for (const [uni, latex] of Object.entries(DISPLAY_TO_LATEX)) {
    if (uni !== '□' && out.includes(uni)) {
      out = out.split(uni).join(`${latex} `);
    }
  }
  return out.trim();
}

function needsSpaceAfterMacro(replacement: string, nextChar: string): boolean {
  return /^\\[a-zA-Z]+$/.test(replacement) && /^[a-zA-Z]/.test(nextChar);
}

export interface TokenEditSession {
  tokenId: number;
  originalRaw: string;
  originalDisplay: string;
  kind: MathTokenKind;
  matchCount: number;
  singleSegments: { prefix: string; suffix: string; prevChar: string; nextChar: string; wasBraced: boolean };
  allSegments: { parts: string[]; prevChars: string[]; nextChars: string[]; wasBraced: boolean[] };
}

export function createTokenEditSession(
  tex: string,
  tokens: MathToken[],
  targetId: number
): TokenEditSession | null {
  const target = tokens[targetId];
  if (!target) return null;

  const matching = tokens.filter((t) => t.raw === target.raw);
  const parts: string[] = [];
  const prevChars: string[] = [];
  const nextChars: string[] = [];
  const wasBraced: boolean[] = [];

  let cursor = 0;
  for (const tok of matching) {
    parts.push(tex.slice(cursor, tok.start));
    prevChars.push(prevNonSpaceChar(tex, tok.start));
    nextChars.push(tex[tok.end] || '');
    wasBraced.push(tex[tok.start - 1] === '{');
    cursor = tok.end;
  }
  parts.push(tex.slice(cursor));

  return {
    tokenId: targetId,
    originalRaw: target.raw,
    originalDisplay: target.display,
    kind: target.kind,
    matchCount: matching.length,
    singleSegments: {
      prefix: tex.slice(0, target.start),
      suffix: tex.slice(target.end),
      prevChar: prevNonSpaceChar(tex, target.start),
      nextChar: tex[target.end] || '',
      wasBraced: tex[target.start - 1] === '{',
    },
    allSegments: {
      parts,
      prevChars,
      nextChars,
      wasBraced,
    },
  };
}

export function applySessionInput(
  session: TokenEditSession,
  rawUserInput: string,
  replaceAllMatching = false
): string {
  const replacement = userInputToLatex(rawUserInput);

  const formatPiece = (
    prevChar: string,
    nextChar: string,
    braced: boolean
  ) => {
    const safeRep = needsSpaceAfterMacro(replacement, nextChar)
      ? `${replacement} `
      : replacement;
    const needsBraces =
      (prevChar === '^' || prevChar === '_') &&
      !braced &&
      safeRep.length > 1 &&
      !safeRep.startsWith('{');
    return needsBraces ? `{${safeRep}}` : safeRep;
  };

  if (!replaceAllMatching || session.matchCount <= 1) {
    const { prefix, suffix, prevChar, nextChar, wasBraced } =
      session.singleSegments;
    return prefix + formatPiece(prevChar, nextChar, wasBraced) + suffix;
  }

  let out = '';
  const { parts, prevChars, nextChars, wasBraced } = session.allSegments;
  for (let i = 0; i < prevChars.length; i++) {
    out += parts[i] + formatPiece(prevChars[i], nextChars[i], wasBraced[i]);
  }
  out += parts[parts.length - 1];
  return out;
}

/**
 * Replaces a single token or all matching tokens in `tex` and returns the new LaTeX string.
 */
export function replaceMathToken(
  tex: string,
  tokens: MathToken[],
  targetId: number,
  rawUserInput: string,
  replaceAllMatching = false
): { nextTex: string; nextSelectedIndex: number } {
  const target = tokens[targetId];
  if (!target) return { nextTex: tex, nextSelectedIndex: 0 };

  const replacement = userInputToLatex(rawUserInput);
  const toReplace = replaceAllMatching
    ? tokens.filter((t) => t.raw === target.raw)
    : [target];

  let nextTex = '';
  let cursor = 0;
  for (const tok of toReplace) {
    nextTex += tex.slice(cursor, tok.start);
    const nextChar = tex[tok.end] || '';
    const prevChar = prevNonSpaceChar(tex, tok.start);
    const safeRep =
      needsSpaceAfterMacro(replacement, nextChar) ? `${replacement} ` : replacement;
    // If replacing a single-char script after ^ or _ with a multi-char token, wrap in braces
    const needsBraces =
      (prevChar === '^' || prevChar === '_') &&
      tex[tok.start - 1] !== '{' &&
      safeRep.length > 1 &&
      !safeRep.startsWith('{');
    nextTex += needsBraces ? `{${safeRep}}` : safeRep;
    cursor = tok.end;
  }
  nextTex += tex.slice(cursor);

  return {
    nextTex,
    nextSelectedIndex: targetId,
  };
}

/**
 * Applies a structural transformation (fraction, power, subscript, root) around the selected token.
 */
export function wrapTokenWithStructure(
  tex: string,
  tokens: MathToken[],
  targetId: number,
  structure: 'fraction' | 'power' | 'subscript' | 'sqrt' | 'parens'
): string {
  const target = tokens[targetId];
  if (!target) return tex;

  const inner = target.raw;
  let wrapped = inner;
  switch (structure) {
    case 'fraction':
      wrapped = `\\frac{${inner}}{\\square}`;
      break;
    case 'power':
      wrapped = `{${inner}}^{\\square}`;
      break;
    case 'subscript':
      wrapped = `{${inner}}_{\\square}`;
      break;
    case 'sqrt':
      wrapped = `\\sqrt{${inner}}`;
      break;
    case 'parens':
      wrapped = `\\left(${inner}\\right)`;
      break;
  }

  return tex.slice(0, target.start) + wrapped + tex.slice(target.end);
}

export const STRUCTURE_TEMPLATES = [
  {
    id: 'fraction',
    label: 'Fraction',
    latex: '\\frac{\\square}{\\square}',
    preview: '\\frac{a}{b}',
  },
  {
    id: 'power',
    label: 'Power',
    latex: '{\\square}^{\\square}',
    preview: 'x^{n}',
  },
  {
    id: 'subscript',
    label: 'Subscript',
    latex: '{\\square}_{\\square}',
    preview: 'x_{i}',
  },
  {
    id: 'sqrt',
    label: 'Square root',
    latex: '\\sqrt{\\square}',
    preview: '\\sqrt{x}',
  },
  {
    id: 'exp',
    label: 'Exponential',
    latex: 'e^{-\\square}',
    preview: 'e^{-x}',
  },
  {
    id: 'sum',
    label: 'Summation',
    latex: '\\sum_{i=1}^{n} \\square',
    preview: '\\sum_{i=1}^{n}',
  },
  {
    id: 'integral',
    label: 'Integral',
    latex: '\\int_{0}^{\\infty} \\square\\, dx',
    preview: '\\int_{a}^{b}',
  },
  {
    id: 'derivative',
    label: 'Derivative',
    latex: '\\frac{d\\square}{dx}',
    preview: '\\frac{dy}{dx}',
  },
  {
    id: 'parens',
    label: 'Parentheses',
    latex: '\\left(\\square\\right)',
    preview: '(x)',
  },
] as const;

export const COMMON_GREEK_PALETTE = [
  'μ',
  'σ',
  'λ',
  'α',
  'β',
  'γ',
  'δ',
  'ε',
  'θ',
  'π',
  'ρ',
  'τ',
  'φ',
  'ω',
  'Δ',
  'Σ',
  'Ω',
  '∞',
] as const;

export const COMMON_OPERATOR_PALETTE = [
  '=',
  '≥',
  '≤',
  '>',
  '<',
  '≠',
  '≈',
  '+',
  '−',
  '×',
  '÷',
  '±',
  '·',
  '→',
  '∈',
  '∂',
] as const;

export const COMMON_VARIABLE_PALETTE = [
  'x',
  'y',
  'd',
  't',
  'n',
  'k',
  'i',
  'f',
  'p',
  'r',
] as const;

export interface FormulaTemplateItem {
  id: string;
  category: 'Probability & Statistics' | 'Calculus & Analysis' | 'Modeling & Metrics';
  label: string;
  hint: string;
  latex: string;
}

export const FORMULA_TEMPLATES: FormulaTemplateItem[] = [
  {
    id: 'exp-dist',
    category: 'Probability & Statistics',
    label: 'Exponential distribution',
    hint: 'Probability density with mean μ',
    latex: String.raw`f(d) = \frac{1}{\mu}\, e^{-d/\mu}, \qquad d \ge 0`,
  },
  {
    id: 'normal-dist',
    category: 'Probability & Statistics',
    label: 'Normal (Gaussian) distribution',
    hint: 'Bell curve with mean μ and std σ',
    latex: String.raw`f(x) = \frac{1}{\sigma \sqrt{2\pi}}\, e^{-\frac{(x - \mu)^2}{2\sigma^2}}`,
  },
  {
    id: 'poisson-dist',
    category: 'Probability & Statistics',
    label: 'Poisson distribution',
    hint: 'Discrete event probability with rate λ',
    latex: String.raw`P(k) = \frac{\lambda^k e^{-\lambda}}{k!}`,
  },
  {
    id: 'linear-reg',
    category: 'Probability & Statistics',
    label: 'Linear regression model',
    hint: 'Intercept β₀, slope β₁, error εᵢ',
    latex: String.raw`\hat{y}_i = \beta_0 + \beta_1 x_i + \varepsilon_i`,
  },
  {
    id: 'sample-variance',
    category: 'Probability & Statistics',
    label: 'Sample variance',
    hint: 'Unbiased variance across n observations',
    latex: String.raw`s^2 = \frac{1}{n - 1} \sum_{i=1}^{n} (x_i - \bar{x})^2`,
  },
  {
    id: 'bayes',
    category: 'Probability & Statistics',
    label: "Bayes' theorem",
    hint: 'Posterior probability P(A|B)',
    latex: String.raw`P(A \mid B) = \frac{P(B \mid A)\, P(A)}{P(B)}`,
  },
  {
    id: 'definite-integral',
    category: 'Calculus & Analysis',
    label: 'Definite integral',
    hint: 'Improper integral of exponential decay',
    latex: String.raw`\int_{0}^{\infty} e^{-\lambda t}\, dt = \frac{1}{\lambda}`,
  },
  {
    id: 'logistic-ode',
    category: 'Calculus & Analysis',
    label: 'Logistic growth ODE',
    hint: 'Growth rate r and carrying capacity K',
    latex: String.raw`\frac{dy}{dt} = r \cdot y \left(1 - \frac{y}{K}\right)`,
  },
  {
    id: 'piecewise',
    category: 'Calculus & Analysis',
    label: 'Piecewise function',
    hint: 'Conditional branches by domain',
    latex: String.raw`f(x) = \begin{cases} x^2, & x > 0 \\ 0, & x \le 0 \end{cases}`,
  },
  {
    id: 'gravity-model',
    category: 'Modeling & Metrics',
    label: 'Gravity / spatial interaction',
    hint: 'Trip flow between origin i and destination j',
    latex: String.raw`T_{ij} = k \, \frac{P_i \, P_j}{d_{ij}^{\gamma}}`,
  },
  {
    id: 'logit-choice',
    category: 'Modeling & Metrics',
    label: 'Multinomial logit choice',
    hint: 'Mode choice probability from utility Vᵢ',
    latex: String.raw`P_i = \frac{e^{V_i}}{\sum_{j=1}^{J} e^{V_j}}`,
  },
  {
    id: 'rmse',
    category: 'Modeling & Metrics',
    label: 'Root mean square error (RMSE)',
    hint: 'Prediction error metric across n samples',
    latex: String.raw`\mathrm{RMSE} = \sqrt{\frac{1}{n} \sum_{i=1}^{n} (y_i - \hat{y}_i)^2}`,
  },
];


