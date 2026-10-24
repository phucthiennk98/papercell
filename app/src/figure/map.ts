// Bản đồ nền kéo/zoom được (MapLibre + OpenFreeMap, không cần key) cho thẻ hình JS.
// Dùng trong code hình qua: pc.map({ data, kind, lat, lon, color, size, basemap })
import * as d3 from 'd3'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 cần biết file worker; Vite đóng gói worker kèm các phần nó dùng.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

maplibregl.setWorkerUrl(workerUrl)

export const BASEMAPS = {
  light: { label: 'Light', url: 'https://tiles.openfreemap.org/styles/positron' },
  streets: { label: 'Streets', url: 'https://tiles.openfreemap.org/styles/liberty' },
  bright: { label: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright' },
  dark: { label: 'Dark', url: 'https://tiles.openfreemap.org/styles/dark' },
  offline: { label: 'Offline (bounded)', url: '' },
} as const
export type Basemap = keyof typeof BASEMAPS

/** Build a self-contained offline MapLibre style strictly bounded to the displayed data region. */
function buildBoundedOfflineStyle(bounds: [[number, number], [number, number]], dark = false): maplibregl.StyleSpecification {
  const [[x0, y0], [x1, y1]] = bounds
  const dx = Math.max(x1 - x0, 0.02), dy = Math.max(y1 - y0, 0.02)
  const padX = dx * 0.15, padY = dy * 0.15
  const minLon = Math.max(-180, x0 - padX), maxLon = Math.min(180, x1 + padX)
  const minLat = Math.max(-85, y0 - padY), maxLat = Math.min(85, y1 + padY)
  const span = Math.max(maxLon - minLon, maxLat - minLat)
  const step = span > 60 ? 10 : span > 20 ? 5 : span > 8 ? 2 : span > 3 ? 1 : span > 1 ? 0.5 : span > 0.3 ? 0.1 : 0.05

  const features: GeoJSON.Feature[] = [
    {
      type: 'Feature',
      properties: { kind: 'frame' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]]],
      },
    },
  ]
  const startLon = Math.ceil(minLon / step) * step
  for (let lon = startLon; lon <= maxLon + 1e-9; lon += step) {
    features.push({
      type: 'Feature',
      properties: { kind: 'grid' },
      geometry: { type: 'LineString', coordinates: [[+lon.toFixed(5), minLat], [+lon.toFixed(5), maxLat]] },
    })
  }
  const startLat = Math.ceil(minLat / step) * step
  for (let lat = startLat; lat <= maxLat + 1e-9; lat += step) {
    features.push({
      type: 'Feature',
      properties: { kind: 'grid' },
      geometry: { type: 'LineString', coordinates: [[minLon, +lat.toFixed(5)], [maxLon, +lat.toFixed(5)]] },
    })
  }

  return {
    version: 8,
    sources: {
      'pc-offline-grid': {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      },
    },
    layers: [
      { id: 'pc-bg', type: 'background', paint: { 'background-color': dark ? '#0f172a' : '#f1f5f9' } },
      {
        id: 'pc-frame-fill',
        type: 'fill',
        source: 'pc-offline-grid',
        filter: ['==', ['get', 'kind'], 'frame'],
        paint: { 'fill-color': dark ? '#1e293b' : '#ffffff', 'fill-opacity': 0.92 },
      },
      {
        id: 'pc-grid-line',
        type: 'line',
        source: 'pc-offline-grid',
        filter: ['==', ['get', 'kind'], 'grid'],
        paint: { 'line-color': dark ? '#334155' : '#e2e8f0', 'line-width': 1, 'line-dasharray': [2, 2] },
      },
      {
        id: 'pc-frame-border',
        type: 'line',
        source: 'pc-offline-grid',
        filter: ['==', ['get', 'kind'], 'frame'],
        paint: { 'line-color': dark ? '#475569' : '#cbd5e1', 'line-width': 1.2 },
      },
    ],
  }
}

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
  /** Display name for the color legend (defaults to the column name). */
  colorLabel?: string
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

const interpolator = (scheme = 'blues') => scheme.startsWith('#') ? d3.interpolateRgbBasis(scheme.includes(',') ? scheme.split(',').map((s) => s.trim()) : ['#e2e8f0', scheme.trim()]) : ((d3 as any)[`interpolate${scheme[0].toUpperCase()}${scheme.slice(1)}`] ?? d3.interpolateBlues)

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
      legend = `<div class="pcm-title">${esc(o.colorLabel ?? o.color)}</div><div class="pcm-ramp" style="background:linear-gradient(90deg,${stops})"></div><div class="pcm-ends"><span>${d3.format('~s')(ext[0])}</span><span>${d3.format('~s')(ext[1])}</span></div>`
    } else {
      const cats = [...new Set(vals.map(String))].slice(0, 10)
      const sc = d3.scaleOrdinal<string, string>().domain(cats).range(o.scheme?.startsWith('#') ? o.scheme.split(',').map((s) => s.trim()) : d3.schemeTableau10)
      fs.forEach((f) => { f.properties._c = cats.includes(String(f.properties[o.color!])) ? sc(String(f.properties[o.color!])) : '#bbbbbb' })
      legend = `<div class="pcm-title">${esc(o.colorLabel ?? o.color)}</div>` + cats.map((c) => `<div class="pcm-cat"><i style="background:${sc(c)}"></i>${esc(c)}</div>`).join('')
    }
  } else { const c = o.scheme?.startsWith('#') ? o.scheme.split(',')[0].trim() : (({ blues: '#2a78d6', greens: '#16a34a', oranges: '#ea580c', reds: '#dc2626', purples: '#7c3aed', viridis: '#21918c', turbo: '#0284c7', ylorrd: '#e11d48', rdbu: '#2166ac', tableau10: '#4e79a7', observable10: '#4269d0', set2: '#66c2a5' } as Record<string, string>)[o.scheme ?? 'blues'] ?? '#2a78d6'); fs.forEach((f) => { f.properties._c = c }) }
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
    box.innerHTML = '<div class="pcm-empty">Nothing to draw. Pick the latitude/longitude columns, or use a GeoJSON file.</div>'
    return box
  }
  const legend = styleFeatures(fs, o)
  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: fs }
  // Khung bao theo tọa độ thô: d3.geoBounds hiểu vòng ngược chiều kim đồng hồ (chuẩn GeoJSON) là "cả địa cầu trừ vùng này".
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  const walk = (c: any): void => { if (typeof c[0] === 'number') { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]) } else c.forEach(walk) }
  fs.forEach((f) => { if (f.geometry && 'coordinates' in f.geometry) walk(f.geometry.coordinates) })
  const bounds: [[number, number], [number, number]] = [[x0, y0], [x1, y1]]
  const chosenBasemap = o.basemap ?? 'light'
  const startOffline = chosenBasemap === 'offline' || (typeof navigator !== 'undefined' && navigator.onLine === false)
  const initialStyle = startOffline
    ? buildBoundedOfflineStyle(bounds, chosenBasemap === 'dark')
    : BASEMAPS[chosenBasemap].url

  const map = new maplibregl.Map({
    container: box,
    style: initialStyle,
    bounds: [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]],
    fitBoundsOptions: { padding: 30, maxZoom: 14 },
    attributionControl: { compact: true },
    cooperativeGestures: true,
  })
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

  let dataAttached = false
  const attachDataLayers = () => {
    if (dataAttached || map.getSource('pc')) return
    dataAttached = true
    map.addSource('pc', { type: 'geojson', data: fc })
    const kind = o.kind ?? (fs[0].geometry.type === 'Point' ? 'points' : 'regions')
    if (kind === 'heat') {
      // Trọng số mỗi điểm giảm theo số điểm để nhiều điểm không thành một mảng đỏ; có cột trọng số thì chia theo giá trị lớn nhất
      const per = Math.min(1, 40 / fs.length)
      const wMax = o.size ? Math.max(...fs.map((f) => Number(f.properties._w) || 0), 1e-9) : 1
      map.addLayer({
        id: 'pc-heat', type: 'heatmap', source: 'pc', paint: {
          'heatmap-weight': o.size ? ['*', per, ['/', ['get', '_w'], wMax]] : per,
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 12, 8, 22, 13, 32],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 1, 13, 3],
          'heatmap-opacity': 0.85,
        },
      })
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
  }

  map.on('load', attachDataLayers)

  if (legend) {
    const lg = document.createElement('div')
    lg.className = 'pcm-legend'
    lg.innerHTML = legend
    box.append(lg)
  }
  // Báo rõ thay vì để ô đen: nền không tải được (mất mạng) thì tự chuyển sang khung tọa độ giới hạn theo dữ liệu
  const note = (text: string) => {
    let n = box.querySelector<HTMLDivElement>('.pcm-note')
    if (!n) { n = document.createElement('div'); n.className = 'pcm-note'; box.append(n) }
    n.textContent = text
  }
  let fellBackToOffline = startOffline
  const switchToBoundedOffline = () => {
    if (fellBackToOffline || dataAttached) return
    fellBackToOffline = true
    dataAttached = false
    map.setStyle(buildBoundedOfflineStyle(bounds, chosenBasemap === 'dark'))
    map.once('styledata', () => {
      attachDataLayers()
      note('Offline mode: showing bounded coordinate grid for the data region.')
    })
  }
  const slow = setTimeout(() => {
    if (!map.isStyleLoaded() && !dataAttached) switchToBoundedOffline()
  }, 3500)
  map.on('error', () => {
    if (!map.isStyleLoaded() && !dataAttached) switchToBoundedOffline()
  })
  map.on('load', () => { clearTimeout(slow); if (!fellBackToOffline) box.querySelector('.pcm-note')?.remove() })
  map.on('webglcontextlost', () => note('The browser paused this map because too many maps are open. Reload the page to see it.'))
  const ro = new ResizeObserver(() => map.resize())
  ro.observe(box)
  ;(box as any).__pcCleanup = () => { clearTimeout(slow); ro.disconnect(); map.remove() }
  ;(box as any).__map = map
  return box
}
