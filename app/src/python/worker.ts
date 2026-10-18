// Kernel Python chạy trong Web Worker: một không gian biến chung cho cả tài liệu.
/// <reference lib="webworker" />

const PYODIDE_VERSION = '314.0.7'
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

// Hàm chạy một ô: bắt stdout/stderr, giá trị biểu thức cuối và các hình matplotlib.
const GLUE = `
import ast, io, json, os, sys, traceback
os.environ.setdefault("MPLBACKEND", "agg")
__pc_globals = {"__name__": "__main__"}

def __pc_rich(value):
    if value is None:
        return None
    mod = type(value).__module__ or ""
    if mod.startswith("matplotlib"):
        return None
    for meth, mime in (("_repr_html_", "text/html"), ("_repr_svg_", "image/svg+xml")):
        fn = getattr(value, meth, None)
        if callable(fn):
            try:
                data = fn()
                if data:
                    return {"mime": mime, "data": data}
            except Exception:
                pass
    return {"mime": "text/plain", "data": repr(value)}

def __pc_run(code, params_json):
    __pc_globals.update(json.loads(params_json))
    out, err = io.StringIO(), io.StringIO()
    saved = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = out, err
    outputs, error, value = [], None, None
    try:
        tree = ast.parse(code, "<ô>")
        last = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = ast.Expression(tree.body.pop().value)
        exec(compile(tree, "<ô>", "exec"), __pc_globals)
        if last is not None:
            value = eval(compile(last, "<ô>", "eval"), __pc_globals)
    except BaseException as e:
        tb = traceback.extract_tb(e.__traceback__)
        frames = [f for f in tb if f.filename == "<ô>"]
        lines = [f"Dòng {f.lineno}: {f.line}" for f in frames if f.line]
        error = "\\n".join(lines + [f"{type(e).__name__}: {e}"])
    finally:
        sys.stdout, sys.stderr = saved
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is not None:
        plt.rcParams["svg.fonttype"] = "none"
        plt.rcParams["axes.unicode_minus"] = False
        for n in plt.get_fignums():
            buf = io.StringIO()
            plt.figure(n).savefig(buf, format="svg", bbox_inches="tight")
            outputs.append({"mime": "image/svg+xml", "data": buf.getvalue()})
        plt.close("all")
    rich = __pc_rich(value)
    if rich:
        outputs.append(rich)
    return json.dumps({"stdout": out.getvalue(), "stderr": err.getvalue(), "outputs": outputs, "error": error})
`

type Req = { id: number; type: 'run'; code: string; params: Record<string, unknown> } | { id: number; type: 'init' }

let py: any
const post = (m: unknown) => (self as DedicatedWorkerGlobalScope).postMessage(m)

const ready = (async () => {
  post({ type: 'status', text: 'Đang tải Python…' })
  const mod = await import(/* @vite-ignore */ `${INDEX_URL}pyodide.mjs`)
  py = await mod.loadPyodide({ indexURL: INDEX_URL })
  await py.runPythonAsync(GLUE)
  post({ type: 'status', text: 'Python sẵn sàng', ready: true })
})()

let chain: Promise<unknown> = ready.catch(() => {})

async function handle(req: Req) {
  try {
    await ready
    if (req.type === 'init') return post({ id: req.id, ok: true })
    await py.loadPackagesFromImports(req.code, {
      messageCallback: (m: string) => { if (/^Loading /.test(m)) post({ type: 'status', text: 'Đang cài ' + m.replace(/^Loading /, '') }) },
      errorCallback: () => {},
    })
    const res = py.globals.get('__pc_run')(req.code, JSON.stringify(req.params ?? {}))
    post({ id: req.id, ok: true, result: JSON.parse(res) })
    post({ type: 'status', text: 'Python sẵn sàng', ready: true })
  } catch (e) {
    post({ id: req.id, ok: false, error: String((e as Error)?.message ?? e) })
  }
}

self.onmessage = (e: MessageEvent<Req>) => { chain = chain.then(() => handle(e.data)) }
