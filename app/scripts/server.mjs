// Đóng gói server bằng esbuild (bỏ qua CSS mà các kit của Plate import), rồi chạy.
// node scripts/server.mjs          → build một lần
// node scripts/server.mjs --watch  → build lại và khởi động lại khi sửa code
import { spawn } from 'node:child_process'
import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')
const outfile = 'server-dist/index.mjs'
let child = null
const restart = () => {
  if (!watch) return
  child?.kill()
  child = spawn(process.execPath, [outfile], { stdio: 'inherit' })
}

const ctx = await esbuild.context({
  entryPoints: ['server/index.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  alias: { '@': './src' },
  // Một số gói CommonJS cần require trong bản ESM
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
  plugins: [{ name: 'restart', setup: (b) => b.onEnd((r) => { if (!r.errors.length) restart() }) }],
})

if (watch) await ctx.watch()
else { await ctx.rebuild(); await ctx.dispose() }
