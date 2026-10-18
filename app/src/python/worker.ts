// Kernel Python chỉ dùng để KIỂM CHỨNG: chạy code Python gốc trên cùng dữ liệu và lấy biến `ket_qua`.
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

def __pc_verify(code, params_json, files_json):
    import pandas as pd
    files = json.loads(files_json)
    data = {}
    for f in files:
        key = f["key"]
        data[key] = pd.read_csv(io.StringIO(f["content"])) if f["kind"] == "csv" else json.loads(f["content"])
    g = {"__name__": "__main__", "data": data, **json.loads(params_json)}
    out = io.StringIO()
    saved = sys.stdout
    sys.stdout = out
    try:
        exec(compile(code, "<python>", "exec"), g)
    except BaseException as e:
        sys.stdout = saved
        tb = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "<python>"]
        lines = [f"Dòng {f.lineno}: {f.line}" for f in tb if f.line]
        return json.dumps({"error": "\\n".join(lines + [f"{type(e).__name__}: {e}"])})
    finally:
        sys.stdout = saved
        plt = sys.modules.get("matplotlib.pyplot")
        if plt is not None:
            plt.close("all")
    if "ket_qua" not in g:
        return json.dumps({"error": "Code Python chưa gán biến ket_qua (giá trị dùng để so với JS)."})
    return json.dumps({"value": __pc_jsonable(g["ket_qua"]), "stdout": out.getvalue()}, default=str)
`

type Req = { id: number; type: 'verify'; code: string; params: Record<string, unknown>; files: { key: string; kind: string; content: string }[] }

let py: any
const post = (m: unknown) => (self as DedicatedWorkerGlobalScope).postMessage(m)

const ready = (async () => {
  post({ type: 'status', text: 'Đang tải Python…' })
  const mod = await import(/* @vite-ignore */ `${INDEX_URL}pyodide.mjs`)
  py = await mod.loadPyodide({ indexURL: INDEX_URL })
  await py.loadPackage(['pandas'])
  await py.runPythonAsync(GLUE)
  post({ type: 'status', text: 'Python sẵn sàng', ready: true })
})()

let chain: Promise<unknown> = ready.catch(() => {})

async function handle(req: Req) {
  try {
    await ready
    await py.loadPackagesFromImports(req.code, {
      messageCallback: (m: string) => { if (/^Loading /.test(m)) post({ type: 'status', text: 'Đang cài ' + m.replace(/^Loading /, '') }) },
      errorCallback: () => {},
    })
    const res = py.globals.get('__pc_verify')(req.code, JSON.stringify(req.params ?? {}), JSON.stringify(req.files ?? []))
    post({ id: req.id, ok: true, result: JSON.parse(res) })
    post({ type: 'status', text: 'Python sẵn sàng', ready: true })
  } catch (e) {
    post({ id: req.id, ok: false, error: String((e as Error)?.message ?? e) })
  }
}

self.onmessage = (e: MessageEvent<Req>) => { chain = chain.then(() => handle(e.data)) }
