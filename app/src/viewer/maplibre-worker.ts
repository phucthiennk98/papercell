// Single-file HTML export helper: inline the MapLibre worker bundle as text and instantiate via Blob URL.
// When opened via file://, Chrome blocks ES module workers created from blob: URLs ("Worker failed to load"),
// so we strip the trailing export statement and instantiate a classic Worker instead.
import src from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw'

const classic = src.replace(/export\s*\{[^}]*\};?\s*(\/\/# sourceMappingURL=.*)?\s*$/, '')
const url = URL.createObjectURL(new Blob([classic], { type: 'text/javascript' }))

// MapLibre requests a module worker by default; under file:// origin ("null"),
// we intercept module worker requests and return a classic Worker running the inlined bundle.
// This keeps MapLibre maps working offline when opening exported HTML files directly from disk.
const NativeWorker = window.Worker
window.Worker = class extends NativeWorker {
  constructor(u: string | URL, opts?: WorkerOptions) {
    if (opts?.type === 'module' || String(u) === url) super(url)
    else super(u, opts)
  }
} as typeof Worker

export default url
