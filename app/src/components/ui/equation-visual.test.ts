import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySessionInput,
  createTokenEditSession,
  renderInteractiveKatex,
  replaceMathToken,
  tokenizeLatex,
  wrapTokenWithStructure,
} from './equation-visual';

test('tokenizes and instruments exponential distribution equation with data-eqtok attributes', () => {
  const tex = String.raw`f(d) = \frac{1}{\mu}\, e^{-d/\mu}, \qquad d \ge 0`;
  const tokens = tokenizeLatex(tex);
  assert.equal(tokens.length, 13);
  assert.equal(tokens[3].display, '1');
  assert.equal(tokens[3].kind, 'number');
  assert.equal(tokens[4].display, 'μ');
  assert.equal(tokens[4].kind, 'symbol');
  assert.equal(tokens[11].display, '≥');
  assert.equal(tokens[12].display, '0');

  const html = renderInteractiveKatex(tex, tokens);
  assert.equal(html.includes('data-eqtok="3"'), true);
  assert.equal(html.includes('data-eqtok="4"'), true);
  assert.equal(html.includes('data-eqtok="12"'), true);

  // Replace numerator 1 with 2.5
  const updated1 = replaceMathToken(tex, tokens, 3, '2.5');
  assert.equal(
    updated1.nextTex,
    String.raw`f(d) = \frac{2.5}{\mu}\, e^{-d/\mu}, \qquad d \ge 0`
  );

  // Replace all occurrences of \mu with 0.6
  const updatedAllMu = replaceMathToken(tex, tokens, 4, '0.6', true);
  assert.equal(
    updatedAllMu.nextTex,
    String.raw`f(d) = \frac{1}{0.6}\, e^{-d/0.6}, \qquad d \ge 0`
  );
});

test('handles sums, integrals, hats, roots, and piecewise cases with data-eqtok', () => {
  const formulas = [
    String.raw`\sum_{i=1}^{n} x_i^2`,
    String.raw`\int_{0}^{\infty} e^{-\lambda t}\, dt = \frac{1}{\lambda}`,
    String.raw`\hat{y}_i = \beta_0 + \beta_1 x_i`,
    String.raw`\sqrt{a^2 + b^2}`,
    String.raw`f(x) = \begin{cases} x^2, & x > 0 \\ 0, & x \le 0 \end{cases}`,
  ];

  for (const f of formulas) {
    const tokens = tokenizeLatex(f);
    assert.ok(tokens.length > 0, `Expected tokens for ${f}`);
    const html = renderInteractiveKatex(f, tokens);
    assert.ok(
      html.includes('data-eqtok="0"'),
      `Expected data-eqtok in rendered HTML for ${f}`
    );
  }
});

test('edit session handles intermediate empty input, comma decimals, and sync-all', () => {
  const tex = String.raw`f(d) = \frac{1}{\mu}\, e^{-d/\mu}, \qquad d \ge 0`;
  const tokens = tokenizeLatex(tex);
  const muSession = createTokenEditSession(tex, tokens, 4);
  assert.ok(muSession);
  assert.equal(muSession.matchCount, 2);

  // Clearing input while typing produces a valid \square placeholder without losing offsets
  assert.equal(
    applySessionInput(muSession, '', false),
    String.raw`f(d) = \frac{1}{\square}\, e^{-d/\mu}, \qquad d \ge 0`
  );

  // Typing comma decimal "0,6" with syncAll=true updates both \mu occurrences
  assert.equal(
    applySessionInput(muSession, '0,6', true),
    String.raw`f(d) = \frac{1}{0{,}6}\, e^{-d/0{,}6}, \qquad d \ge 0`
  );

  // Wrapping token 12 ("0") into a fraction
  assert.equal(
    wrapTokenWithStructure(tex, tokens, 12, 'fraction'),
    String.raw`f(d) = \frac{1}{\mu}\, e^{-d/\mu}, \qquad d \ge \frac{0}{\square}`
  );
});
