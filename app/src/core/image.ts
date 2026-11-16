/** 图片相关的小工具。都在浏览器里运行,不可用时优雅地返回 undefined。 */

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
}

export function guessMime(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

/** 计算缩放尺寸:限制最长边和总像素,避免手机上超大图把内存撑爆 */
export function fitSize(w: number, h: number, maxSide: number, maxPixels = 8_000_000) {
  const s = Math.min(1, maxSide / Math.max(w, h), Math.sqrt(maxPixels / (w * h)))
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) }
}

async function drawToBlob(
  blob: Blob,
  maxSide: number,
  type: string,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number } | undefined> {
  if (typeof createImageBitmap !== 'function') return undefined
  try {
    const probe = await createImageBitmap(blob)
    const { width, height } = fitSize(probe.width, probe.height, maxSide)
    probe.close?.()
    const bmp = await createImageBitmap(blob, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' })
    let out: Blob | null = null
    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(bmp.width, bmp.height)
      const ctx = c.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.drawImage(bmp, 0, 0)
        out = await c.convertToBlob({ type, quality })
      }
    } else if (typeof document !== 'undefined') {
      const c = document.createElement('canvas')
      c.width = bmp.width
      c.height = bmp.height
      const ctx = c.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.drawImage(bmp, 0, 0)
        out = await new Promise<Blob | null>((r) => c.toBlob(r, type, quality))
      }
    }
    const w = bmp.width
    const h = bmp.height
    bmp.close?.()
    return out ? { blob: out, width: w, height: h } : undefined
  } catch {
    return undefined
  }
}

export async function makeThumb(blob: Blob): Promise<Blob | undefined> {
  return (await drawToBlob(blob, 480, 'image/jpeg', 0.8))?.blob
}

/** 导出手账 HTML 时使用的压缩版本;失败时返回 undefined,调用方改用原图 */
export async function makeExportImage(blob: Blob): Promise<Blob | undefined> {
  return (await drawToBlob(blob, 1280, 'image/jpeg', 0.82))?.blob
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk))
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`
}
