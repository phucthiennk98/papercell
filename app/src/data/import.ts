// Nạp file dữ liệu người dùng: CSV/TSV/TXT, Excel (.xlsx), JSON, GeoJSON.
// Mọi bảng được chuẩn hóa về CSV (dấu phẩy, số dùng dấu chấm) để JS và Python gốc đọc giống nhau.
import * as d3 from 'd3'
import type { DataFile } from '@/editor/types'

export const ACCEPT = '.csv,.tsv,.txt,.xlsx,.json,.geojson'
const MAX_BYTES = 20e6

/** Đọc chữ: thử UTF-8, nếu có ký tự lỗi thì thử bảng mã tiếng Việt Windows-1258. */
async function readText(file: File) {
  const buf = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buf)
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '')
  try { return new TextDecoder('windows-1258').decode(buf) } catch { return utf8 }
}

/** Đoán dấu phân cách: dấu xuất hiện đều nhất ở các dòng đầu. */
function sniffDelimiter(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20)
  let best = ',', bestScore = -1
  for (const d of [',', '\t', ';', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1)
    const min = Math.min(...counts), same = counts.filter((c) => c === counts[0]).length
    const score = min > 0 ? same * 100 + min : -1
    if (score > bestScore) { bestScore = score; best = d }
  }
  return best
}

const DECIMAL_COMMA = /^-?\d{1,3}(\.\d{3})*,\d+$|^-?\d+,\d+$/
/** Bảng (mảng các dòng) → CSV chuẩn; đổi số kiểu "1.234,5" thành "1234.5" khi cần. */
function rowsToCsv(rows: unknown[][], decimalComma: boolean) {
  const clean = rows
    .filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''))
    .map((r) => r.map((c) => {
      if (c === null || c === undefined) return ''
      if (c instanceof Date) return c.toISOString().slice(0, 10)
      const s = String(c).trim()
      return decimalComma && DECIMAL_COMMA.test(s) ? s.replace(/\./g, '').replace(',', '.') : s
    }))
  if (!clean.length) throw new Error('The file has no data rows.')
  // Tên cột trống hoặc trùng thì đặt lại
  const seen = new Map<string, number>()
  clean[0] = clean[0].map((h, i) => {
    const base = h || `cot_${i + 1}`, n = (seen.get(base) ?? 0) + 1
    seen.set(base, n); return n > 1 ? `${base}_${n}` : base
  })
  return d3.csvFormatRows(clean)
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, '')

export async function importFile(file: File): Promise<DataFile[]> {
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is larger than 20 MB. Filter or aggregate the data before loading it.`)
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()

  if (ext === 'xlsx') {
    const { default: readXlsxFile } = await import('read-excel-file/browser')
    const sheets = await readXlsxFile(file)
    const out = sheets.filter((s) => s.data.length).map((s) => ({
      name: `${baseName(file.name)}${sheets.length > 1 ? '_' + s.sheet : ''}.csv`,
      kind: 'csv' as const,
      content: rowsToCsv(s.data as unknown[][], false),
    }))
    if (!out.length) throw new Error('The Excel file has no sheet with data.')
    return out
  }
  if (ext === 'xls') throw new Error('The old .xls format is not supported. Open it in Excel and save as .xlsx or .csv.')

  const text = await readText(file)
  if (ext === 'json' || ext === 'geojson') {
    JSON.parse(text) // báo lỗi sớm nếu file hỏng
    return [{ name: file.name, kind: 'json', content: text }]
  }
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
    const delim = ext === 'tsv' ? '\t' : sniffDelimiter(text)
    const rows = d3.dsvFormat(delim).parseRows(text)
    return [{ name: `${baseName(file.name)}.csv`, kind: 'csv', content: rowsToCsv(rows, delim === ';' || delim === '\t') }]
  }
  throw new Error(`.${ext} files are not supported. Use CSV, TXT, TSV, XLSX, JSON or GeoJSON.`)
}

// ---- Mô tả cột để gợi ý khi chọn ----
export type ColType = 'number' | 'date' | 'text' | 'lat' | 'lon'
export type Column = { name: string; type: ColType; distinct: number; sample: string }

const LAT = /^(lat|latitude|vi_?do|y_?wgs)/i, LON = /^(lon|lng|long|longitude|kinh_?do|x_?wgs)/i

export function describeColumns(rows: Record<string, unknown>[]): Column[] {
  if (!rows.length) return []
  const names = Object.keys(rows[0])
  const sample = rows.slice(0, 2000)
  return names.map((name) => {
    const vals = sample.map((r) => r[name]).filter((v) => v !== null && v !== undefined && v !== '')
    const nums = vals.filter((v) => typeof v === 'number')
    let type: ColType = 'text'
    if (vals.length && vals.every((v) => v instanceof Date)) type = 'date'
    else if (vals.length && nums.length === vals.length) {
      type = 'number'
      if (LAT.test(name) && nums.every((v) => Math.abs(v as number) <= 90)) type = 'lat'
      else if (LON.test(name) && nums.every((v) => Math.abs(v as number) <= 180)) type = 'lon'
    }
    return { name, type, distinct: new Set(vals.map(String)).size, sample: vals.slice(0, 3).map(String).join(', ') }
  })
}

/** Dữ liệu dạng bảng (mảng đối tượng) — kể cả GeoJSON thì lấy thuộc tính của từng đối tượng. */
export function asRows(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[]
  const g = v as { type?: string; features?: { properties?: Record<string, unknown> }[] }
  if (g?.type === 'FeatureCollection' && Array.isArray(g.features)) return g.features.map((f) => f.properties ?? {})
  return []
}

export const isGeoJSON = (v: unknown) => (v as { type?: string })?.type === 'FeatureCollection'
