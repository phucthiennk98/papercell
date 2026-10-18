# Skill: writing Papercell figure code (JavaScript)

## Runtime contract
- The code is the **body of an async function**. `await` is allowed. It must `return` one of:
  - a Plot figure: `return Plot.plot({...})`
  - a DOM node (e.g. from `pc.map(...)` or `document.createElement`)
  - an HTML string (tables, KPI cards). Escape data text with `pc.esc(text)`.
- In scope:
  - `Plot` (Observable Plot 0.6) and `d3` (v7).
  - `data.<name>`: the document's datasets. CSV/Excel → array of row objects, auto-typed (numbers are numbers, ISO dates are `Date`). GeoJSON → a FeatureCollection.
  - `width`: the figure's width in px. Always pass `width` to `Plot.plot`.
  - Every parameter is a plain variable (e.g. `bins`), also available as `params.<name>`. Never redeclare them. A slider gives a number, a dropdown gives the chosen option (string or number), an on/off switch gives `true`/`false`.
  - `expose(value)`: publishes a value that the Verify tab compares with Python's `ket_qua`. Call it once with the key numbers behind the figure.
  - `ket_qua`: the precomputed Python result for the current slider values, or `undefined` if not precomputed. Guard it: `if (!ket_qua) return '<div class="fig-empty">…</div>'`.
  - `pc.label("<dataset>", "<column>")`: the column's display name chosen by the author (falls back to the column name). Use it for axis titles, legend titles and table headers instead of raw column names, e.g. `x: { label: pc.label("survey", "income") }`.
  - `pc.map({ data, kind: "points" | "heat" | "regions", lat, lon, color, size, basemap: "light" | "streets" | "bright" | "dark", width })` returns an interactive MapLibre map. Use `kind: "regions"` with GeoJSON polygons.
- No network access: never `fetch`, never import modules. Everything comes from `data`.

## Conventions
- Use only columns that exist in the datasets listed below; spell them exactly.
- Prefer Plot transforms over manual loops: `Plot.groupX`, `Plot.binX`, `Plot.windowY`, `Plot.normalizeY`, `Plot.stackY`, `Plot.hexbin`.
- Line/area marks connect points in data order: sort by x first (`d3.sort(rows, d => d.x)`).
- Add `tip: true` to the main mark. Label axes with units. Use `grid: true` on the value axis.
- Categorical colors: `scheme: "tableau10"`. Sequential: `"blues"`, `"viridis"`, `"ylorrd"`. Diverging: `"rdbu"` with a symmetric domain.
- Long category labels: `marginLeft` / `marginBottom` and `tickRotate: -30`.
- Keep the code short and readable; comment only non-obvious steps. Keep existing parameter names.

## Example
```js
const rows = data.survey.filter(d => d.income <= max_income)
expose(rows.length)
return Plot.plot({
  width, height: 300, marginLeft: 60,
  x: { label: "Travel time (min)" }, y: { label: "Respondents", grid: true },
  color: { legend: true, scheme: "tableau10" },
  marks: [Plot.rectY(rows, Plot.binX({ y: "count" }, { x: "travel_min", fill: "mode", thresholds: bins, tip: true })), Plot.ruleY([0])],
})
```
