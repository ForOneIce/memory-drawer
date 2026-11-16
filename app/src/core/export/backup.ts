import { unzipSync } from 'fflate'
import { getDB } from '../db'
import { stamp, safeFilename } from '../format'
import { makeThumb } from '../image'
import {
  APP_VERSION,
  SCHEMA_VERSION,
  type AssetRecord,
  type ConversationRecord,
  type Diary,
  type MessageRecord,
} from '../model'
import { invalidateSearch } from '../search'
import { T } from '../copy'
import {
  attachmentsOf,
  checkAbort,
  inRange,
  loadMessages,
  planExport,
  selectConversations,
  selectDiaries,
  type ExportSelection,
} from './collect'
import type { ExportOutput, ExportProgress } from './html'
import { sha256Hex, zipBuilder } from './zip'

export const BACKUP_FORMAT = 'memory-drawer-backup'

export interface BackupManifest {
  format: typeof BACKUP_FORMAT
  schemaVersion: number
  appVersion: string
  exportedAt: string
  counts: { conversations: number; messages: number; diaries: number; assets: number }
  files: Record<string, { size: number; sha256: string | null }>
}

interface BackupAsset {
  key: string
  convKey: string
  fileName: string
  mime: string
  size: number
  width?: number
  height?: number
  file: string
}

interface BackupData {
  conversations: ConversationRecord[]
  messages: MessageRecord[]
  diaries: Diary[]
  assets: BackupAsset[]
}

export interface BackupInput {
  sel: ExportSelection
  withImages: boolean
}

export async function buildBackup(
  input: BackupInput,
  onProgress?: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportOutput> {
  const plan = await planExport(input.sel)
  if (plan.empty) throw new Error('empty')
  const db = getDB()
  const enc = new TextEncoder()

  const conversations: ConversationRecord[] = []
  const messages: MessageRecord[] = []
  const assetKeys = new Set<string>()
  let step = 0
  const total = plan.conversations.length + 2
  const tick = async () => {
    step++
    onProgress?.({ done: step, total })
    await new Promise((r) => setTimeout(r, 0))
    checkAbort(signal)
  }

  for (const c of await selectConversations(input.sel)) {
    checkAbort(signal)
    const msgs = (await loadMessages(c.key)).filter((m) => inRange(m.createdAt, input.sel))
    if (msgs.length === 0) continue
    conversations.push({ ...c, hiddenAt: null })
    messages.push(...msgs)
    if (input.withImages) {
      for (const b of attachmentsOf(msgs)) if (b.assetKey) assetKeys.add(b.assetKey)
    }
    await tick()
  }
  const diaries = await selectDiaries(input.sel)

  const zip = zipBuilder()
  const files: BackupManifest['files'] = {}
  const assetMeta: BackupAsset[] = []
  let n = 0
  for (const key of assetKeys) {
    checkAbort(signal)
    const a = await db.assets.get(key)
    if (!a) continue
    n++
    const file = `assets/${n}`
    const bytes = new Uint8Array(await a.blob.arrayBuffer())
    files[file] = { size: bytes.length, sha256: await sha256Hex(bytes) }
    zip.add(`${file}`, bytes, false)
    assetMeta.push({
      key: a.key,
      convKey: a.convKey,
      fileName: a.fileName,
      mime: a.mime,
      size: a.size,
      width: a.width,
      height: a.height,
      file,
    })
  }

  const data: BackupData = { conversations, messages, diaries, assets: assetMeta }
  const dataBytes = enc.encode(JSON.stringify(data))
  files['data.json'] = { size: dataBytes.length, sha256: await sha256Hex(dataBytes) }
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      conversations: conversations.length,
      messages: messages.length,
      diaries: diaries.length,
      assets: assetMeta.length,
    },
    files,
  }
  zip.add('manifest.json', enc.encode(JSON.stringify(manifest, null, 2)), true)
  zip.add('data.json', dataBytes, true)
  await tick()
  const blob = await zip.finish()
  await tick()

  return {
    format: 'backup',
    kind: 'zip',
    blob,
    filename: `${safeFilename(`${T.exporter.filenamePrefix}-备份-${stamp()}`)}.zip`,
    mime: 'application/zip',
    stats: {
      conversations: conversations.length,
      diaries: diaries.length,
      messages: messages.length,
      days: plan.days,
      images: assetMeta.length,
    },
    withImages: assetMeta.length > 0,
  }
}

// ---- 导入备份 ----

export type BackupFailure = 'not-backup' | 'too-new' | 'damaged'

export class BackupError extends Error {
  readonly reason: BackupFailure
  constructor(reason: BackupFailure) {
    super(reason)
    this.name = 'BackupError'
    this.reason = reason
  }
}

export interface BackupImportResult {
  conversations: number
  skippedConversations: number
  messages: number
  diaries: number
  skippedDiaries: number
  assets: number
  damagedAssets: number
}

/**
 * 数据迁移:schemaVersion 变化时,在这里按版本依次升级。
 * 约定:只新增字段,不重命名、不删除,旧备份永远能读。
 */
const MIGRATIONS: Array<(d: BackupData) => BackupData> = [
  // v1 -> v2: 暂无
]

function migrate(data: BackupData, from: number): BackupData {
  let cur = data
  for (let v = from; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v - 1]
    if (step) cur = step(cur)
  }
  return cur
}

const dec = new TextDecoder('utf-8')

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

/** 解析并校验备份包。校验通过之前,不会往本地写入任何东西 */
export async function readBackup(file: Blob): Promise<{
  manifest: BackupManifest
  data: BackupData
  readAsset: (a: BackupAsset) => Promise<Uint8Array | null>
}> {
  let zipBytes: Uint8Array
  try {
    zipBytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    throw new BackupError('damaged')
  }
  const names = new Set<string>()
  try {
    unzipSync(zipBytes, {
      filter: (i) => {
        names.add(i.name)
        return false
      },
    })
  } catch {
    throw new BackupError('not-backup')
  }
  if (!names.has('manifest.json')) throw new BackupError('not-backup')

  const readFile = (name: string): Uint8Array | null => {
    if (!names.has(name)) return null
    try {
      return unzipSync(zipBytes, { filter: (i) => i.name === name })[name] ?? null
    } catch {
      return null
    }
  }

  let manifest: BackupManifest
  try {
    manifest = JSON.parse(dec.decode(readFile('manifest.json') ?? new Uint8Array())) as BackupManifest
  } catch {
    throw new BackupError('not-backup')
  }
  if (!isRecord(manifest) || manifest.format !== BACKUP_FORMAT) throw new BackupError('not-backup')
  if (typeof manifest.schemaVersion !== 'number') throw new BackupError('damaged')
  if (manifest.schemaVersion > SCHEMA_VERSION) throw new BackupError('too-new')

  const dataBytes = readFile('data.json')
  if (!dataBytes) throw new BackupError('damaged')
  const expected = manifest.files?.['data.json']?.sha256
  if (expected) {
    const actual = await sha256Hex(dataBytes)
    if (actual && actual !== expected) throw new BackupError('damaged')
  }
  let data: BackupData
  try {
    data = JSON.parse(dec.decode(dataBytes)) as BackupData
  } catch {
    throw new BackupError('damaged')
  }
  if (
    !isRecord(data) ||
    !Array.isArray(data.conversations) ||
    !Array.isArray(data.messages) ||
    !Array.isArray(data.diaries) ||
    !Array.isArray(data.assets)
  ) {
    throw new BackupError('damaged')
  }
  data = migrate(data, manifest.schemaVersion)

  return {
    manifest,
    data,
    readAsset: async (a) => {
      const bytes = readFile(a.file)
      if (!bytes) return null
      const sum = manifest.files?.[a.file]?.sha256
      if (sum) {
        const actual = await sha256Hex(bytes)
        if (actual && actual !== sum) return null
      }
      return bytes
    },
  }
}

export async function importBackup(
  file: Blob,
  onProgress?: (p: ExportProgress) => void,
): Promise<BackupImportResult> {
  const { data, readAsset } = await readBackup(file)
  const db = getDB()
  const result: BackupImportResult = {
    conversations: 0,
    skippedConversations: 0,
    messages: 0,
    diaries: 0,
    skippedDiaries: 0,
    assets: 0,
    damagedAssets: 0,
  }

  const msgsByConv = new Map<string, MessageRecord[]>()
  for (const m of data.messages) {
    if (!m || typeof m.convKey !== 'string') continue
    const list = msgsByConv.get(m.convKey) ?? []
    list.push(m)
    msgsByConv.set(m.convKey, list)
  }
  const assetsByConv = new Map<string, BackupAsset[]>()
  for (const a of data.assets) {
    const list = assetsByConv.get(a.convKey) ?? []
    list.push(a)
    assetsByConv.set(a.convKey, list)
  }

  let done = 0
  const total = data.conversations.length + 1
  for (const rec of data.conversations) {
    const incoming = msgsByConv.get(rec.key) ?? []
    const existing = await db.conversations.get(rec.key)
    const old = existing ? await db.messages.where('convKey').equals(rec.key).toArray() : []

    const merged = new Map<string, MessageRecord>()
    for (const o of old) merged.set(o.id, o)
    let changed = !existing
    for (const m of incoming) {
      if (!merged.has(m.id)) changed = true
      merged.set(m.id, m)
    }
    if (existing && !changed && existing.updatedAt >= rec.updatedAt) {
      result.skippedConversations++
    } else {
      const damaged = new Set<string>()
      const newAssets: AssetRecord[] = []
      for (const a of assetsByConv.get(rec.key) ?? []) {
        if (await db.assets.get(a.key)) continue
        const bytes = await readAsset(a)
        if (!bytes) {
          damaged.add(a.key)
          result.damagedAssets++
          continue
        }
        const blob = new Blob([bytes as BlobPart], { type: a.mime })
        newAssets.push({
          key: a.key,
          convKey: a.convKey,
          fileName: a.fileName,
          mime: a.mime,
          size: a.size,
          width: a.width,
          height: a.height,
          blob,
          thumb: a.mime.startsWith('image/') ? await makeThumb(blob) : undefined,
        })
      }
      const ordered = [...merged.values()]
        .map((m) => ({
          ...m,
          blocks: m.blocks.map((b) =>
            b.type === 'attachment' && b.assetKey && damaged.has(b.assetKey)
              ? { ...b, assetKey: undefined, missing: true }
              : b,
          ),
        }))
        .sort((a, b) => a.createdAt - b.createdAt || a.seq - b.seq)
      ordered.forEach((m, i) => (m.seq = i))
      const record: ConversationRecord = {
        ...rec,
        messageCount: ordered.length,
        updatedAt: existing ? Math.max(existing.updatedAt, rec.updatedAt) : rec.updatedAt,
        createdAt: existing ? Math.min(existing.createdAt, rec.createdAt) : rec.createdAt,
        currentMessageId: existing && existing.updatedAt > rec.updatedAt ? existing.currentMessageId : rec.currentMessageId,
        hiddenAt: existing?.hiddenAt ?? null,
      }
      await db.transaction('rw', db.conversations, db.messages, db.assets, async () => {
        if (newAssets.length) await db.assets.bulkPut(newAssets)
        await db.messages.where('convKey').equals(rec.key).delete()
        await db.messages.bulkPut(ordered)
        await db.conversations.put(record)
      })
      result.conversations++
      result.messages += incoming.length
      result.assets += newAssets.length
    }
    done++
    onProgress?.({ done, total })
    await new Promise((r) => setTimeout(r, 0))
  }

  for (const d of data.diaries) {
    if (!d || typeof d.id !== 'string' || typeof d.content !== 'string') continue
    if (await db.diaries.get(d.id)) {
      result.skippedDiaries++
    } else {
      await db.diaries.put({ ...d, hiddenAt: null })
      result.diaries++
    }
  }
  invalidateSearch()
  onProgress?.({ done: total, total })
  return result
}
