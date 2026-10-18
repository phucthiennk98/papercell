// Bản đọc (viewer) dùng khi xuất HTML: chỉ hiển thị, không Python, không AI.
// Đóng gói thành một chunk duy nhất; scripts/inline-viewer.mjs gộp tất cả vào viewer.html.
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^.*\/python\/kernel$/, replacement: path.resolve(__dirname, 'src/viewer/kernel-stub.ts') },
      { find: /^maplibre-gl\/dist\/maplibre-gl-worker\.mjs\?worker&url$/, replacement: path.resolve(__dirname, 'src/viewer/maplibre-worker.ts') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  build: {
    outDir: 'dist-viewer',
    emptyOutDir: true,
    assetsInlineLimit: 1e9,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { input: path.resolve(__dirname, 'viewer.html'), output: { inlineDynamicImports: true } },
  },
})
