import { Zip, ZipDeflate, ZipPassThrough } from 'fflate'

/** 流式生成 ZIP:数据分块累积成 Blob,避免一次性占用两份内存 */
export function zipBuilder() {
  const chunks: BlobPart[] = []
  let error: unknown = null
  let resolveDone!: (b: Blob) => void
  let rejectDone!: (e: unknown) => void
  const done = new Promise<Blob>((res, rej) => {
    resolveDone = res
    rejectDone = rej
  })
  const zip = new Zip((err, chunk, final) => {
    if (err) {
      error = err
      rejectDone(err)
      return
    }
    chunks.push(chunk as BlobPart)
    if (final && !error) resolveDone(new Blob(chunks, { type: 'application/zip' }))
  })
  return {
    add(name: string, data: Uint8Array, compress: boolean) {
      const f = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name)
      zip.add(f)
      f.push(data, true)
    },
    finish() {
      zip.end()
      return done
    },
  }
}

export async function sha256Hex(data: Uint8Array): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) return null
    const digest = await subtle.digest('SHA-256', data as BufferSource)
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}
