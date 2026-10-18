// Bản đồ nền kéo/zoom được (MapLibre + OpenFreeMap, không cần key) cho thẻ hình JS.
// Dùng trong code hình qua: pc.map({ data, kind, lat, lon, color, size, basemap })
import * as d3 from 'd3'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 cần biết file worker; Vite đóng gói worker kèm các phần nó dùng.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

maplibregl.setWorkerUrl(workerUrl)

export const BASEMAPS = {
  light: { label: 'Sáng', url: 'https://tiles.openfreemap.org/styles/positron' },
  streets: { label: 'Đường phố', url: 'https://tiles.openfreemap.org/styles/liberty' },
  bright: { label: 'Tươi', url: 'https://tiles.openfreemap.org/styles/bright' },
  dark: { label: 'Tối', url: 'https://tiles.openfreemap.org/styles/dark' },
} as const
export type Basemap = keyof typeof BASEMAPS

export type MapOptions = {
  data: unknown
  kind?: 'points' | 'heat' | 'regions'
  lat?: string
  lon?: string
  color?: string
  size?: string
  basemap?: Basemap
  scheme?: string
  height?: number
  width?: number
  title?: string
}

type Feature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, unknown>>

/** Thoát ký tự HTML cho chữ lấy từ dữ liệu. */
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : NaN)

function toFeatures(o: MapOptions): Feature[] {
  const g = o.data as GeoJSON.FeatureCollection
  if (g && (g as any).type === 'FeatureCollection') return (g.features as Feature[]).map((f) => ({ ...f, properties: { ...(f.properties ?? {}) } }))
  if (!Array.isArray(o.data) || !o.lat || !o.lon) return []
  return (o.data as Record<string, unknown>[]).flatMap((r) => {
    const lat = num(r[o.lat!]), lon = num(r[o.lon!])
    return isFinite(lat) && isFinite(lon) ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { ...r } } as Feature] : []
  })
}

const interpolator = (scheme = 'blues') => (d3 as any)[`interpolate${scheme[0].toUpperCase()}${scheme.slice(1)}`] ?? d3.interpolateBlues

/** Tô màu và kích thước sẵn cho từng điểm; trả về chú giải. */
function styleFeatures(fs: Feature[], o: MapOptions) {
  let legend = ''
  if (o.color) {
    const vals = fs.map((f) => f.properties[o.color!])
    const nums = vals.map(num)
    if (nums.every((v, i) => isFinite(v) || vals[i] === null || vals[i] === '')) {
      const ext = d3.extent(nums.filter(isFinite)) as [number, number]
      const sc = d3.scaleSequential(interpolator(o.scheme)).domain(ext[0] === ext[1] ? [ext[0] - 1, ext[1] + 1] : ext)
      fs.forEach((f, i) => { f.properties._c = isFinite(nums[i]) ? sc(nums[i]) : '#bbbbbb' })
      const stops = d3.range(0, 1.01, 0.25).map((t) => sc(ext[0] + t * (ext[1] - ext[0]))).join(',')
      legend = `<div class="pcm-title">${esc(o.color)}</div><div class="pcm-ramp" style="background:linear-gradient(90deg,${stops})"></div><div class="pcm-ends"><span>${d3.format('~s')(ext[0])}</span><span>${d3.format('~s')(ext[1])}</span></div>`
    } else {
      const cats = [...new Set(vals.map(String))].slice(0, 10)
      const sc = d3.scaleOrdinal<string, string>().domain(cats).range(d3.schemeTableau10)
      fs.forEach((f) => { f.properties._c = cats.includes(String(f.properties[o.color!])) ? sc(String(f.properties[o.color!])) : '#bbbbbb' })
      legend = `<div class="pcm-title">${esc(o.color)}</div>` + cats.map((c) => `<div class="pcm-cat"><i style="background:${sc(c)}"></i>${esc(c)}</div>`).join('')
    }
  } else fs.forEach((f) => { f.properties._c = '#2a78d6' })
  if (o.size) {
    const nums = fs.map((f) => num(f.properties[o.size!]))
    const sc = d3.scaleSqrt().domain([0, d3.max(nums.filter(isFinite)) ?? 1]).range([3, 16])
    fs.forEach((f, i) => { f.properties._r = isFinite(nums[i]) ? sc(Math.max(0, nums[i])) : 3; f.properties._w = isFinite(nums[i]) ? nums[i] : 0 })
  } else fs.forEach((f) => { f.properties._r = 5; f.properties._w = 1 })
  return legend
}

/** Tạo bản đồ; phần tử trả về có __pcCleanup để giải phóng WebGL khi vẽ lại. */
export function makeMap(o: MapOptions): HTMLElement {
  const width = o.width ?? 640
  const box = document.createElement('div')
  box.className = 'pc-map'
  box.style.height = `${o.height ?? Math.max(260, Math.round(width * 0.62))}px`
  const fs = toFeatures(o)
  if (!fs.length) {
    box.innerHTML = '<div class="pcm-empty">Không có điểm nào để vẽ. Chọn đúng cột vĩ độ/kinh độ, hoặc dùng file GeoJSON.</div>'
    return box
  }
  const legend = styleFeatures(fs, o)
  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: fs }
  // Khung bao theo tọa độ thô: d3.geoBounds hiểu vòng ngược chiều kim đồng hồ (chuẩn GeoJSON) là "cả địa cầu trừ vùng này".
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  const walk = (c: any): void => { if (typeof c[0] === 'number') { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]) } else c.forEach(walk) }
  fs.forEach((f) => { if (f.geometry && 'coordinates' in f.geometry) walk(f.geometry.coordinates) })
  const bounds = [[x0, y0], [x1, y1]]

  const map = new maplibregl.Map({
    container: box,
    style: BASEMAPS[o.basemap ?? 'light'].url,
    bounds: [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]],
    fitBoundsOptions: { padding: 30, maxZoom: 14 },
    attributionControl: { compact: true },
    cooperativeGestures: true,
  })
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

  map.on('load', () => {
    map.addSource('pc', { type: 'geojson', data: fc })
    const kind = o.kind ?? (fs[0].geometry.type === 'Point' ? 'points' : 'regions')
    if (kind === 'heat') {
      map.addLayer({ id: 'pc-heat', type: 'heatmap', source: 'pc', paint: { 'heatmap-weight': o.size ? ['get', '_w'] : 1, 'heatmap-radius': 18, 'heatmap-opacity': 0.85 } })
    } else if (kind === 'regions') {
      map.addLayer({ id: 'pc-fill', type: 'fill', source: 'pc', paint: { 'fill-color': ['get', '_c'], 'fill-opacity': 0.7 } })
      map.addLayer({ id: 'pc-line', type: 'line', source: 'pc', paint: { 'line-color': '#ffffff', 'line-width': 0.8 } })
      map.addLayer({ id: 'pc-pts', type: 'circle', source: 'pc', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': ['get', '_c'], 'circle-radius': ['get', '_r'] } })
    } else {
      map.addLayer({ id: 'pc-pts', type: 'circle', source: 'pc', paint: { 'circle-color': ['get', '_c'], 'circle-radius': ['get', '_r'], 'circle-opacity': 0.8, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 0.6 } })
    }
    // Bấm vào điểm/vùng để xem thuộc tính
    for (const layer of ['pc-pts', 'pc-fill']) {
      if (!map.getLayer(layer)) continue
      map.on('click', layer, (e: maplibregl.MapLayerMouseEvent) => {
        const p = e.features?.[0]?.properties ?? {}
        const rows = Object.entries(p).filter(([k]) => !k.startsWith('_')).slice(0, 8)
          .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')
        new maplibregl.Popup({ closeButton: false, maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(`<table class="pcm-pop">${rows}</table>`).addTo(map)
      })
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
    }
  })

  if (legend) {
    const lg = document.createElement('div')
    lg.className = 'pcm-legend'
    lg.innerHTML = legend
    box.append(lg)
  }
  // Báo rõ thay vì để ô đen: nền không tải được (mất mạng) hoặc trình duyệt thu hồi WebGL
  const note = (text: string) => {
    let n = box.querySelector<HTMLDivElement>('.pcm-note')
    if (!n) { n = document.createElement('div'); n.className = 'pcm-note'; box.append(n) }
    n.textContent = text
  }
  const slow = setTimeout(() => { if (!map.isStyleLoaded()) note('Chưa tải được bản đồ nền từ OpenFreeMap. Kiểm tra kết nối mạng rồi tải lại trang.') }, 12000)
  map.on('load', () => { clearTimeout(slow); box.querySelector('.pcm-note')?.remove() })
  map.on('webglcontextlost', () => note('Trình duyệt đã tạm tắt bản đồ này vì mở quá nhiều bản đồ cùng lúc. Tải lại trang để xem.'))
  const ro = new ResizeObserver(() => map.resize())
  ro.observe(box)
  ;(box as any).__pcCleanup = () => { clearTimeout(slow); ro.disconnect(); map.remove() }
  ;(box as any).__map = map
  return box
}
