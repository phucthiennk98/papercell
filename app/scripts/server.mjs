// Bundle the server with esbuild (ignoring CSS imported by Plate kits), then run it.
// node scripts/server.mjs          → build once
// node scripts/server.mjs --watch  → rebuild and restart on code changes
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
  // Provide require() for CommonJS packages inside the ESM bundle
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
  plugins: [{ name: 'restart', setup: (b) => b.onEnd((r) => { if (!r.errors.length) restart() }) }],
})

if (watch) await ctx.watch()
else { await ctx.rebuild(); await ctx.dispose() }
