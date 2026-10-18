# Skill: writing Papercell original Python code

## Runtime contract
- The code runs as a plain script, once per parameter combination (Precompute tab) or once for Verify.
- In scope:
  - `data["<name>"]`: each CSV/Excel dataset as a pandas DataFrame; GeoJSON as a dict.
  - Every slider parameter as a plain variable (e.g. `bins`). Never redeclare them.
  - pandas and numpy are installed; matplotlib is optional (plots are not shown to readers).
- The script must assign its result to **`ket_qua`**: a number, list, dict, Series or DataFrame.
  - For Verify, `ket_qua` must match the value the JS code passes to `expose(...)` (same structure, same rounding).
  - For Precompute, `ket_qua` is what the JS reads as `ket_qua` to draw the figure, so return exactly the rows the chart needs (e.g. a list of dicts).
- Do not modify `data` in place in a way later runs depend on (each run gets a fresh copy anyway). No file or network access.
- Be deterministic: seed randomness (`np.random.default_rng(7)`).

## Conventions
- Use only columns that exist in the datasets listed below; spell them exactly.
- Keep it vectorized (pandas/numpy), avoid Python loops over rows.
- Round floats the same way as the JS side when the result is verified.

## Example
```python
df = data["survey"]
sub = df[df.income <= max_income]
ket_qua = sub.groupby("mode").travel_min.mean().round(1).to_dict()
```
