// Pyodide Web Worker kernel for verification: executes reference Python code on shared datasets and extracts `result` / `ket_qua`.
/// <reference lib="webworker" />

const PYODIDE_VERSION = '314.0.7'
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

const GLUE = `
import ast, io, json, os, sys, traceback
os.environ.setdefault("MPLBACKEND", "agg")

def __pc_jsonable(v):
    mod = type(v).__module__ or ""
    if mod.startswith("pandas"):
        import pandas as pd
        if isinstance(v, pd.Series):
            return {str(k): __pc_jsonable(x) for k, x in v.items()}
        if isinstance(v, pd.DataFrame):
            if not isinstance(v.index, pd.RangeIndex):
                v = v.reset_index()
            return [{str(c): __pc_jsonable(x) for c, x in row.items()} for row in v.to_dict("records")]
    if mod.startswith("numpy"):
        return v.tolist() if hasattr(v, "tolist") else v.item()
    if isinstance(v, dict):
        return {str(k): __pc_jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, set)):
        return [__pc_jsonable(x) for x in v]
    if isinstance(v, float) and v != v:
        return None
    return v

__pc_data = {}

def __pc_load(files_json):
    """Load the data once (reused for the whole parameter grid)."""
    import pandas as pd
    global __pc_data
    __pc_data = {}
    for f in json.loads(files_json):
        __pc_data[f["key"]] = pd.read_csv(io.StringIO(f["content"])) if f["kind"] == "csv" else json.loads(f["content"])

def __pc_run_one(code, params_json):
    """Run the code for one parameter set; data is copied so later runs are not affected."""
    import copy, linecache
    linecache.cache["<python>"] = (len(code), None, code.splitlines(True), "<python>")
    data = {k: (v.copy() if hasattr(v, "copy") else copy.deepcopy(v)) for k, v in __pc_data.items()}
    g = {"__name__": "__main__", "data": data, **json.loads(params_json)}
    out = io.StringIO()
    saved = sys.stdout
    sys.stdout = out
    try:
        exec(compile(code, "<python>", "exec"), g)
    except BaseException as e:
        sys.stdout = saved
        tb = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "<python>"]
        lines = [f"Line {f.lineno}: {f.line}" if f.line else f"Line {f.lineno}" for f in tb]
        return json.dumps({"error": "\\n".join(lines + [f"{type(e).__name__}: {e}"])})
    finally:
        sys.stdout = saved
        plt = sys.modules.get("matplotlib.pyplot")
        if plt is not None:
            plt.close("all")
    if "ket_qua" not in g:
        return json.dumps({"error": "The Python code did not assign the variable ket_qua."})
    return json.dumps({"value": __pc_jsonable(g["ket_qua"]), "stdout": out.getvalue()}, default=str)

def __pc_verify(code, params_json, files_json):
    __pc_load(files_json)
    return __pc_run_one(code, params_json)
`

type Files = { key: string; kind: string; content: string }[]
type Req =
  | { id: number; type: 'verify'; code: string; params: Record<string, unknown>; files: Files }
  | { id: number; type: 'grid'; code: string; combos: Record<string, number | string | boolean>[]; files: Files }

let py: any
const post = (m: unknown) => (self as DedicatedWorkerGlobalScope).postMessage(m)

const ready = (async () => {
  post({ type: 'status', text: 'Loading Python…' })
  const mod = await import(/* @vite-ignore */ `${INDEX_URL}pyodide.mjs`)
  py = await mod.loadPyodide({ indexURL: INDEX_URL })
  await py.loadPackage(['pandas'])
  await py.runPythonAsync(GLUE)
  post({ type: 'status', text: 'Python ready', ready: true })
})()

let chain: Promise<unknown> = ready.catch(() => {})

async function handle(req: Req) {
  try {
    await ready
    await py.loadPackagesFromImports(req.code, {
      messageCallback: (m: string) => { if (/^Loading /.test(m)) post({ type: 'status', text: 'Installing ' + m.replace(/^Loading /, '') }) },
      errorCallback: () => {},
    })
    if (req.type === 'grid') {
      // Run full parameter grid: stream each combination result as soon as it finishes for live progress updates
      py.globals.get('__pc_load')(JSON.stringify(req.files ?? []))
      const one = py.globals.get('__pc_run_one')
      for (let i = 0; i < req.combos.length; i++) {
        const r = JSON.parse(one(req.code, JSON.stringify(req.combos[i])))
        post({ type: 'grid-item', id: req.id, i, ok: !r.error, value: r.value, error: r.error })
        await new Promise((res) => setTimeout(res, 0))
      }
      post({ id: req.id, ok: true, result: { done: req.combos.length } })
    } else {
      const res = py.globals.get('__pc_verify')(req.code, JSON.stringify(req.params ?? {}), JSON.stringify(req.files ?? []))
      post({ id: req.id, ok: true, result: JSON.parse(res) })
    }
    post({ type: 'status', text: 'Python ready', ready: true })
  } catch (e) {
    post({ id: req.id, ok: false, error: String((e as Error)?.message ?? e) })
  }
}

self.onmessage = (e: MessageEvent<Req>) => { chain = chain.then(() => handle(e.data)) }
