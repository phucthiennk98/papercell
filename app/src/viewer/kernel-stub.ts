// Bản xuất HTML không có Python: mọi kết quả đã được tính sẵn trong file.
const off = () => Promise.reject(new Error('Bản xuất bản không chạy Python.'))
export type GridItem = { i: number; ok: boolean; value?: unknown; error?: string }
export const kernel = { status: { text: 'Không có Python', ready: false }, verify: off, runGrid: off, cancel() {}, subscribe: () => () => {} }
