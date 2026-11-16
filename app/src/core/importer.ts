import { getDB } from './db'
import { plainPreview } from './format'
import { guessMime, makeThumb } from './image'
import type { AssetRecord, Block, Conversation, ConversationRecord, MessageRecord } from './model'
import { messageText } from './model'
import type { PlatformAdapter } from './platform'
import { createSafeSource, rawFromFiles, rawFromZip, type RawSource, type SafeSource } from './source'
import { adapters, detectAdapter } from '../platforms'
import { invalidateSearch } from './search'

export interface OpenedSource {
  adapter: PlatformAdapter
  safe: SafeSource
  formatVersion: string
  conversationCount: number
  label: string
}

export type OpenError = 'empty' | 'unknown-format' | 'unreadable'

export class OpenSourceError extends Error {
  readonly reason: OpenError
  constructor(reason: OpenError, message: string) {
    super(message)
    this.name = 'OpenSourceError'
    this.reason = reason
  }
}

const allMarkers = () => [...new Set(adapters.flatMap((a) => a.rootMarkers))]

/** 从用户选择的文件(ZIP 或文件夹)打开,并识别是哪个平台。此时还没有读取任何聊天内容 */
export async function openFromFiles(files: File[]): Promise<OpenedSource> {
  if (files.length === 0) throw new OpenSourceError('empty', '没有选择文件')
  let raw: RawSource
  try {
    const zip = files.length === 1 && /\.zip$/i.test(files[0].name) ? files[0] : null
    raw = zip ? await rawFromZip(zip, allMarkers(), zip.name) : rawFromFiles(files, allMarkers())
  } catch {
    throw new OpenSourceError('unreadable', '这个文件打不开')
  }
  return openFromRaw(raw)
}

export async function openFromRaw(raw: RawSource): Promise<OpenedSource> {
  const adapter = detectAdapter(raw.names())
  if (!adapter) throw new OpenSourceError('unknown-format', '没能认出这份文件')
  const safe = createSafeSource(raw, adapter.allowPath)
  const info = await adapter.inspect(safe)
  return {
    adapter,
    safe,
    formatVersion: info.formatVersion,
    conversationCount: info.conversationCount,
    label: raw.label,
  }
}

export interface ImportResult {
  added: number
  updated: number
  skipped: number
  failed: number
  images: number
  missingImages: number
  warnings: number
  cancelled: boolean
  messages: number
}

export interface ImportProgress {
  done: number
  total: number
}

function attachmentBaseName(path: string): string {
  return path.split('/').pop() ?? path
}

function previewOf(conv: Conversation): string {
  for (const m of conv.messages) {
    const t = plainPreview(messageText(m))
    if (t) return t.slice(0, 80)
  }
  return ''
}

function numericAwareCompare(a: string, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  return a.localeCompare(b)
}

/** 把一份解析好的会话写入本地。同一会话重复导入时合并(取并集),不会重复,也不会动日记 */
export async function saveConversation(
  conv: Conversation,
  safe: SafeSource | null,
  stats?: { images: number; missingImages: number },
): Promise<'added' | 'updated' | 'skipped'> {
  const db = getDB()
  const existing = await db.conversations.get(conv.key)
  if (existing && existing.updatedAt === conv.updatedAt && existing.messageCount === conv.messages.length) {
    return 'skipped'
  }

  // 1. 附件:先处理图片(放在事务之外,因为要做异步的缩略图)
  const assets: AssetRecord[] = []
  const messages = conv.messages.map((m) => ({ ...m, blocks: [...m.blocks] }))
  for (const m of messages) {
    for (let i = 0; i < m.blocks.length; i++) {
      const b = m.blocks[i]
      if (b.type !== 'attachment') continue
      const { sourcePath, ...rest } = b
      let next: Block = { ...rest }
      if (!b.isImage) {
        // 平台通常不会导出文档类附件的内容,只保留文件名,显示成"附件"小标签即可,不算缺失
        m.blocks[i] = next
        continue
      }
      if (sourcePath) {
        const key = `${conv.key}/${attachmentBaseName(sourcePath)}`
        const has = await db.assets.get(key)
        if (has) {
          next = { ...rest, assetKey: key }
        } else if (safe && safe.has(sourcePath)) {
          try {
            const bytes = await safe.read(sourcePath)
            const mime = guessMime(b.fileName)
            const blob = new Blob([bytes as BlobPart], { type: mime })
            const thumb = b.isImage ? await makeThumb(blob) : undefined
            assets.push({
              key,
              convKey: conv.key,
              fileName: b.fileName,
              mime,
              size: bytes.length,
              width: b.width,
              height: b.height,
              blob,
              thumb,
            })
            next = { ...rest, assetKey: key }
            if (stats) stats.images++
          } catch {
            next = { ...rest, missing: true }
            if (stats) stats.missingImages++
          }
        } else {
          next = { ...rest, missing: true }
          if (stats) stats.missingImages++
        }
      } else {
        next = { ...rest, missing: true }
        if (stats) stats.missingImages++
      }
      m.blocks[i] = next
    }
  }

  // 2. 与已有数据合并(取并集,新导出的覆盖同 id 的旧内容)
  const merged = new Map<string, MessageRecord>()
  let keepCurrent = conv.currentMessageId
  if (existing) {
    const old = await db.messages.where('convKey').equals(conv.key).toArray()
    for (const o of old) merged.set(o.id, o)
    if (existing.updatedAt > conv.updatedAt) keepCurrent = existing.currentMessageId
  }
  for (const m of messages) {
    merged.set(m.id, { ...m, key: `${conv.key}/${m.id}`, convKey: conv.key, seq: 0 })
  }
  const ordered = [...merged.values()].sort(
    (a, b) => a.createdAt - b.createdAt || numericAwareCompare(a.id, b.id),
  )
  ordered.forEach((m, i) => (m.seq = i))

  const record: ConversationRecord = {
    key: conv.key,
    platformId: conv.platformId,
    agentId: conv.agentId,
    sourceId: conv.sourceId,
    title: conv.title || existing?.title || '',
    createdAt: existing ? Math.min(existing.createdAt, conv.createdAt) : conv.createdAt,
    updatedAt: existing ? Math.max(existing.updatedAt, conv.updatedAt) : conv.updatedAt,
    currentMessageId: keepCurrent,
    messageCount: ordered.length,
    preview: previewOf({ ...conv, messages: ordered }),
    hiddenAt: existing?.hiddenAt ?? null,
  }

  await db.transaction('rw', db.conversations, db.messages, db.assets, async () => {
    if (assets.length) await db.assets.bulkPut(assets)
    await db.messages.where('convKey').equals(conv.key).delete()
    await db.messages.bulkPut(ordered)
    await db.conversations.put(record)
  })
  return existing ? 'updated' : 'added'
}

export async function importFromSource(
  opened: OpenedSource,
  onProgress?: (p: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<ImportResult> {
  const result: ImportResult = {
    added: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    images: 0,
    missingImages: 0,
    warnings: 0,
    cancelled: false,
    messages: 0,
  }
  const stats = { images: 0, missingImages: 0 }
  for await (const item of opened.adapter.parse(opened.safe, onProgress, signal)) {
    if ('failed' in item) {
      result.failed++
      continue
    }
    result.warnings += item.warnings
    try {
      const r = await saveConversation(item.conversation, opened.safe, stats)
      result[r]++
      if (r !== 'skipped') result.messages += item.conversation.messages.length
    } catch {
      result.failed++
    }
  }
  result.images = stats.images
  result.missingImages = stats.missingImages
  result.cancelled = !!signal?.aborted
  invalidateSearch()
  return result
}
