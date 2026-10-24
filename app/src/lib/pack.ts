// Compress text with gzip + base64 for compact HTML embedding (not cryptographic encryption).
export async function packText(text: string): Promise<{ b64: string; bytes: number }> {
  const raw = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = new Uint8Array(await new Response(raw).arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return { b64: btoa(bin), bytes: buf.length }
}

export async function unpackText(b64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0))
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
}
