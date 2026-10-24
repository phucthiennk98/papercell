# Writing Mathematical Formulas in Papercell (KaTeX & Visual Formula Editor)

Papercell renders block equations (`type: "equation"`) and inline equations (`type: "inline_equation"`) with **KaTeX** and attaches interactive visual tokens (`\htmlData{eqtok=...}`) to every number, variable, Greek symbol, and operator so readers and authors can click any value directly on the rendered formula to edit it in place without touching raw LaTeX code.

## Output Format

- **When creating or inserting a block equation in Markdown or chat**: wrap the LaTeX expression in `$$ ... $$` on its own lines:
  ```markdown
  $$
  f(d) = \frac{1}{\mu}\, e^{-d/\mu}, \qquad d \ge 0
  $$
  ```
- **When editing an existing equation cell**: output ONLY the updated formula wrapped in `$$ ... $$` (or raw LaTeX with no surrounding prose or code fences) so it updates the equation block in place.
- **Inline formulas inside prose paragraphs**: wrap in single `$ ... $` (e.g. `with mean $\mu = 0.6\text{ km}$`). Never use `\(` `\)` or `\[` `\]`.

## KaTeX & Visual Token Rules

1. **Always brace structural arguments**:
   - Write `\frac{1}{\mu}`, never `\frac 1 \mu` or `{1 \over \mu}`.
   - Always brace superscripts and subscripts: `e^{-d/\mu}`, `x_{i}`, `\sigma^{2}`, `d_{ij}^{\gamma}`.
   - Write `\sqrt{x}` or `\sqrt[n]{x}` with explicit braces.
2. **Keep numbers and symbols as clean standalone atoms**:
   - Every number (`1`, `0`, `0.6`, `2\pi`), Greek symbol (`\mu`, `\sigma`, `\lambda`, `\alpha`, `\beta`, `\gamma`, `\theta`), variable (`x`, `y`, `d`, `t`, `n`, `k`), and operator (`=`, `\ge`, `\le`, `\neq`, `\approx`, `\pm`, `\times`, `\cdot`) becomes an interactive clickable token in the Visual Formula Editor.
   - When the user asks to leave a slot customizable, use `\square` (rendered as an interactive empty box $\square$).
   - For comma decimals (e.g. Vietnamese `0,6`), write `0{,}6` or `0.6` so TeX does not insert punctuation spacing after the comma.
3. **Standard Scientific Templates**:
   - **Exponential distribution**: `f(d) = \frac{1}{\mu}\, e^{-d/\mu}, \qquad d \ge 0`
   - **Normal distribution**: `f(x) = \frac{1}{\sigma \sqrt{2\pi}}\, e^{-\frac{(x - \mu)^2}{2\sigma^2}}`
   - **Poisson distribution**: `P(k) = \frac{\lambda^k e^{-\lambda}}{k!}`
   - **Linear regression**: `\hat{y}_i = \beta_0 + \beta_1 x_i + \varepsilon_i`
   - **Sample variance**: `s^2 = \frac{1}{n - 1} \sum_{i=1}^{n} (x_i - \bar{x})^2`
   - **Bayes' theorem**: `P(A \mid B) = \frac{P(B \mid A)\, P(A)}{P(B)}`
   - **Gravity / spatial interaction**: `T_{ij} = k \, \frac{P_i \, P_j}{d_{ij}^{\gamma}}`
   - **Multinomial logit**: `P_i = \frac{e^{V_i}}{\sum_{j=1}^{J} e^{V_j}}`
   - **RMSE**: `\mathrm{RMSE} = \sqrt{\frac{1}{n} \sum_{i=1}^{n} (y_i - \hat{y}_i)^2}`
   - **Piecewise function**:
     ```latex
     f(x) = \begin{cases} x^2, & x > 0 \\ 0, & x \le 0 \end{cases}
     ```
4. **Forbidden macros**:
   - Do not use `\newcommand`, `\def`, `\usepackage`, `\DeclareMathOperator`, `\align` (use `\begin{aligned} ... \end{aligned}` inside `$$ ... $$` if multi-line alignment is needed), or `\tag{...}`.
