import type { ExportOutput } from './html'

/** 普通下载。需要用户点击触发(保存按钮) */
export function downloadOutput(out: Pick<ExportOutput, 'blob' | 'filename'>) {
  const url = URL.createObjectURL(out.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = out.filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 稍后再释放,避免部分浏览器还没开始写文件就被撤销
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function canShareFile(out: Pick<ExportOutput, 'blob' | 'filename' | 'mime'>): boolean {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') {
      return false
    }
    const file = new File([out.blob], out.filename, { type: out.mime })
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

/** 调出系统分享菜单(手机上可选"存储到文件")。用户取消时返回 false,不算异常 */
export async function shareOutput(out: Pick<ExportOutput, 'blob' | 'filename' | 'mime'>): Promise<boolean> {
  const file = new File([out.blob], out.filename, { type: out.mime })
  try {
    await navigator.share({ files: [file] })
    return true
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false
    throw e
  }
}
