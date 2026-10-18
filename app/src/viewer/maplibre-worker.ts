// Bản xuất một file: nhúng worker của MapLibre dạng chữ rồi tạo URL tạm (blob).
// Mở bằng file:// thì Chrome chặn *module* worker từ blob ("Worker failed to load"),
// nên bỏ dòng export cuối file (worker không import gì) và tạo worker kiểu thường (classic).
import src from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw'

const classic = src.replace(/export\s*\{[^}]*\};?\s*(\/\/# sourceMappingURL=.*)?\s*$/, '')
const url = URL.createObjectURL(new Blob([classic], { type: 'text/javascript' }))

// MapLibre luôn xin module worker; ở file:// nó còn coi blob là "khác nguồn" (origin "null" ≠ "file://")
// nên bọc thêm một blob `import "blob:…"`. Trang đọc chỉ có MapLibre dùng module worker,
// nên mọi yêu cầu module worker đều trả về worker thường chạy code đã nhúng ở trên.
const NativeWorker = window.Worker
window.Worker = class extends NativeWorker {
  constructor(u: string | URL, opts?: WorkerOptions) {
    if (opts?.type === 'module' || String(u) === url) super(url)
    else super(u, opts)
  }
} as typeof Worker

export default url
