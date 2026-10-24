# Skill: writing Papercell original Python code

## Runtime contract
- The code runs as a plain script, once per parameter combination (Precompute tab) or once for Verify.
- In scope:
  - `data["<name>"]`: each CSV/Excel dataset as a pandas DataFrame; GeoJSON as a dict.
  - Every parameter as a plain variable (e.g. `bins`): slider → number, dropdown → the chosen option (str or number), on/off switch → `True`/`False`. Never redeclare them.
  - pandas and numpy are installed; matplotlib is optional (plots are not shown to readers).
- The script must assign its result to **`result`**: a number, list, dict, Series or DataFrame.
  - For Verify, `result` must match the value the JS code passes to `expose(...)` (same structure, same rounding).
  - For Precompute, `result` is what the JS reads as `result` to draw the figure, so return exactly the rows the chart needs (e.g. a list of dicts).
- Do not modify `data` in place in a way later runs depend on (each run gets a fresh copy anyway). No file or network access.
- Be deterministic: seed randomness (`np.random.default_rng(7)`).
- When the user asks for synthetic/random data in a figure, use `rng = np.random.default_rng(42)` in Python to generate matching synthetic series/tables and assign `result`.

## Conventions
- Use only columns that exist in the datasets listed below; spell them exactly.
- Keep it vectorized (pandas/numpy), avoid Python loops over rows.
- Round floats the same way as the JS side when the result is verified.

## Example
```python
df = data["survey"]
sub = df[df.income <= max_income]
result = sub.groupby("mode").travel_min.mean().round(1).to_dict()
```
