import { T } from './copy'

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function formatDayLong(ts: number): string {
  const d = new Date(ts)
  return T.reader.dayHeader(d.getFullYear(), d.getMonth() + 1, d.getDate(), T.weekdays[d.getDay()])
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${formatTime(ts)}`
}

export function formatDateShort(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

/** 把 yyyy-mm-dd 输入框的值转成当天 0 点的时间戳 */
export function parseDateInput(v: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(y, m - 1, d).getTime()
  return Number.isFinite(t) ? t : undefined
}

export function toDateInput(ts: number): string {
  return dayKey(ts)
}

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g

/** 清理文件名里的非法字符和过长的内容,保证 Windows / macOS / 手机都能保存 */
export function safeFilename(name: string, fallback = '回忆', maxLen = 80): string {
  let s = name.replace(ILLEGAL, '_').replace(/\s+/g, ' ').trim()
  s = s.replace(/^\.+/, '').replace(/[. ]+$/, '')
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = `_${s}`
  if (s.length > maxLen) s = Array.from(s).slice(0, maxLen).join('')
  return s || fallback
}

/** 列表预览:去掉 Markdown 符号,变成干净的一小段文字 */
export function plainPreview(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>~|]+/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function stamp(ts = Date.now()): string {
  const d = new Date(ts)
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`
}
