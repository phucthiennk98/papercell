// Bản xuất một file: nhúng worker của MapLibre dạng chữ rồi tạo URL tạm, mở bằng file:// vẫn chạy.
import src from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw'

export default URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))
