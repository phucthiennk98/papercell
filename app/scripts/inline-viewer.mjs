// Bundle the viewer into a single dist/viewer.html file (document payload is injected on export).
// JS and CSS are gzip + base64 compressed and unpacked in the browser (~3x smaller output).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const dir = path.join(root, 'dist-viewer')
let html = readFileSync(path.join(dir, 'viewer.html'), 'utf8')
const read = (href) => readFileSync(path.join(dir, href.replace(/^\//, '')), 'utf8')
const pack = (text) => gzipSync(Buffer.from(text, 'utf8'), { level: 9 }).toString('base64')

let css = ''
html = html.replace(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>\s*/g, (_, href) => { css += read(href); return '' })
// All modern browsers support woff2: strip duplicate woff/ttf KaTeX font fallbacks.
css = css.replace(/,\s*url\(data:font\/(?:woff|ttf|truetype)[^)]*\)\s*format\(["'](?:woff|truetype)["']\)/g, '')

let js = ''
html = html.replace(/<script type="module"[^>]*src="(\/assets\/[^"]+\.js)"[^>]*><\/script>\s*/g, (_, src) => { js += read(src); return '' })
if (/src="\/assets\/|href="\/assets\//.test(html)) throw new Error('viewer.html still references external files')
if (!js) throw new Error('Viewer JS file not found')

const boot = `<script type="module">
const unpack = async (id) => {
  const b = Uint8Array.from(atob(document.getElementById(id).textContent.trim()), (c) => c.charCodeAt(0))
  return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
}
const style = document.createElement('style'); style.textContent = await unpack('pc-css'); document.head.append(style)
await import(URL.createObjectURL(new Blob([await unpack('pc-js')], { type: 'text/javascript' })))
</script>`
const blobs = `<script id="pc-css" type="application/x-gzip-base64">${pack(css)}</script>
    <script id="pc-js" type="application/x-gzip-base64">${pack(js)}</script>
    ${boot}`
html = html.replace('</body>', () => `    ${blobs}\n  </body>`)

if (!html.includes('>__PC_DOC__<')) throw new Error('viewer.html is missing the document placeholder')
if (!existsSync(path.join(root, 'dist'))) throw new Error('dist/ does not exist yet')
writeFileSync(path.join(root, 'dist', 'viewer.html'), html)
console.log(`dist/viewer.html: ${(html.length / 1e6).toFixed(2)} MB (JS ${(js.length / 1e6).toFixed(1)} MB, CSS ${(css.length / 1e6).toFixed(1)} MB before compression)`)
