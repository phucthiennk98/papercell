// Chạy code Python gốc cho cả lưới tham số bằng Python cài trên máy (nhanh, dùng được mọi thư viện).
// Mỗi tổ hợp chạy trong một vùng biến riêng, dữ liệu được sao chép để code không làm hỏng lần sau.
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { resolveBin, stopTree } from '../agents/local'

const RUNNER = String.raw`
import copy, io, json, math, os, sys, traceback
os.environ.setdefault("MPLBACKEND", "agg")
sys.stdout.reconfigure(encoding="utf-8")
sys.stdin.reconfigure(encoding="utf-8")
import pandas as pd
try:
    import matplotlib.pyplot
except ImportError:
    import types
    class _Noop:
        def __call__(self, *a, **kw): return self
        def __getattr__(self, k): return self
        def __iter__(self): return iter((self, self))
    _mpl = types.ModuleType("matplotlib")
    _plt = types.ModuleType("matplotlib.pyplot")
    _plt.subplots = lambda *a, **kw: (_Noop(), _Noop())
    _plt.close = lambda *a, **kw: None
    _plt.__getattr__ = lambda k: _Noop()
    _mpl.pyplot = _plt
    sys.modules["matplotlib"] = _mpl
    sys.modules["matplotlib.pyplot"] = _plt
    pd.Series.plot = property(lambda self: _Noop())
    pd.DataFrame.plot = property(lambda self: _Noop())

def jsonable(v):
    mod = type(v).__module__ or ""
    if isinstance(v, pd.Series):
        return {str(k): jsonable(x) for k, x in v.items()}
    if isinstance(v, pd.DataFrame):
        if not isinstance(v.index, pd.RangeIndex):
            v = v.reset_index()
        return [{str(c): jsonable(x) for c, x in row.items()} for row in v.to_dict("records")]
    if mod.startswith("numpy"):
        return jsonable(v.tolist()) if hasattr(v, "tolist") else jsonable(v.item())
    if isinstance(v, dict):
        return {str(k): jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, set)):
        return [jsonable(x) for x in v]
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v

out = sys.stdout
job = json.loads(sys.stdin.read())
data = {}
for f in job["files"]:
    if f["kind"] == "csv":
        data[f["key"]] = pd.read_csv(f["path"])
    else:
        with open(f["path"], encoding="utf-8") as fh:
            data[f["key"]] = json.load(fh)
import linecache
linecache.cache["<python>"] = (len(job["code"]), None, job["code"].splitlines(True), "<python>")
code = compile(job["code"], "<python>", "exec")
print(json.dumps({"ready": True, "python": sys.version.split()[0]}), file=out, flush=True)

for i, combo in enumerate(job["combos"]):
    g = {"__name__": "__main__", "data": {k: (v.copy() if hasattr(v, "copy") else copy.deepcopy(v)) for k, v in data.items()}}
    g.update(combo)
    buf = io.StringIO()
    sys.stdout = buf
    try:
        exec(code, g)
        sys.stdout = out
        res = {"i": i, "ok": True, "value": jsonable(g["ket_qua"])} if "ket_qua" in g else {"i": i, "ok": False, "error": "The Python code did not assign the variable ket_qua."}
    except BaseException as e:
        sys.stdout = out
        tb = [fr for fr in traceback.extract_tb(e.__traceback__) if fr.filename == "<python>"]
        res = {"i": i, "ok": False, "error": "\n".join([f"Line {fr.lineno}: {fr.line}" if fr.line else f"Line {fr.lineno}" for fr in tb] + [f"{type(e).__name__}: {e}"])}
    finally:
        plt = sys.modules.get("matplotlib.pyplot")
        if plt is not None:
            plt.close("all")
    print(json.dumps(res, ensure_ascii=False, default=str), file=out, flush=True)
`

function pythonBin() {
  return resolveBin('python') ?? resolveBin('py') ?? resolveBin('python3')
}

let cached: { at: number; info: { available: boolean; version?: string; pandas?: string; error?: string } } | null = null

/** Có Python + pandas trên máy chạy server không. */
export async function detectPython() {
  if (cached && Date.now() - cached.at < 60_000) return cached.info
  const bin = pythonBin()
  let info: { available: boolean; version?: string; pandas?: string; error?: string } = { available: false, error: 'Python was not found on this computer.' }
  if (bin && !bin.shell) {
    const r = await new Promise<string>((resolve) => {
      const c = spawn(bin.file, ['-c', 'import sys, pandas; print(sys.version.split()[0], pandas.__version__)'], { windowsHide: true })
      let s = ''; c.stdout.on('data', (d) => (s += d)); c.stderr.on('data', (d) => (s += d))
      c.on('error', () => resolve('')); c.on('close', () => resolve(s.trim()))
    })
    const m = /^(\d+\.\d+\.\d+)\s+(\S+)$/.exec(r)
    info = m ? { available: true, version: m[1], pandas: m[2] } : { available: false, error: /pandas/i.test(r) ? 'Python is installed but pandas is missing (pip install pandas).' : 'Could not run Python on this computer.' }
  }
  cached = { at: Date.now(), info }
  return info
}

type Job = { code: string; files: { key: string; kind: string; content: string }[]; combos: Record<string, number | string | boolean>[] }

/** Chạy lưới; trả về luồng JSONL: {"ready":…} rồi mỗi dòng một tổ hợp {"i","ok","value"|"error"}. */
export async function runGrid(job: Job, signal: AbortSignal): Promise<Response> {
  const bin = pythonBin()
  if (!bin || bin.shell) return Response.json({ error: 'Python was not found on this computer.' }, { status: 404 })
  const dir = await mkdtemp(path.join(tmpdir(), 'papercell-grid-'))
  const files = await Promise.all(job.files.map(async (f, i) => {
    const p = path.join(dir, `data_${i}.${f.kind === 'csv' ? 'csv' : 'json'}`)
    await writeFile(p, f.content, 'utf8')
    return { key: f.key, kind: f.kind, path: p }
  }))
  await writeFile(path.join(dir, 'runner.py'), RUNNER, 'utf8')

  const child = spawn(bin.file, ['-X', 'utf8', path.join(dir, 'runner.py')], { cwd: dir, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
  const stop = () => stopTree(child)
  signal.addEventListener('abort', stop)

  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      let stderr = ''
      child.stdout.on('data', (d: Buffer) => ctrl.enqueue(new Uint8Array(d)))
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8') })
      child.on('close', (code) => {
        if (code && !signal.aborted) ctrl.enqueue(enc.encode(JSON.stringify({ fatal: stderr.trim().split('\n').slice(-6).join('\n') || `Python exited with code ${code}.` }) + '\n'))
        ctrl.close()
        rm(dir, { recursive: true, force: true }).catch(() => {})
      })
      child.on('error', (e) => { ctrl.enqueue(enc.encode(JSON.stringify({ fatal: e.message }) + '\n')); ctrl.close() })
    },
  })
  child.stdin.end(JSON.stringify({ code: job.code, files, combos: job.combos }), 'utf8')
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } })
}
