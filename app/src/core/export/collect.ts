import { getDB } from '../db'
import { dayKey } from '../format'
import type { Block, ConversationRecord, Diary, MessageRecord } from '../model'

export interface ExportSelection {
  chats: boolean
  diaries: boolean
  /** 空表示全部 */
  convKeys?: string[]
  from?: number
  /** 不含 */
  to?: number
}

export interface ExportPlan {
  conversations: ConversationRecord[]
  diaries: Diary[]
  messageCount: number
  imageCount: number
  imageBytes: number
  textBytes: number
  days: number
  empty: boolean
}

export class ExportCancelled extends Error {
  constructor() {
    super('cancelled')
    this.name = 'ExportCancelled'
  }
}

export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new ExportCancelled()
}

export const inRange = (ts: number, sel: ExportSelection) =>
  (sel.from === undefined || ts >= sel.from) && (sel.to === undefined || ts < sel.to)

export const hasRange = (sel: ExportSelection) => sel.from !== undefined || sel.to !== undefined

export async function selectConversations(sel: ExportSelection): Promise<ConversationRecord[]> {
  if (!sel.chats) return []
  const all = (await getDB().conversations.toArray()).filter((c) => !c.hiddenAt)
  const keySet = sel.convKeys && sel.convKeys.length ? new Set(sel.convKeys) : null
  return all.filter((c) => !keySet || keySet.has(c.key)).sort((a, b) => a.createdAt - b.createdAt)
}

export async function selectDiaries(sel: ExportSelection): Promise<Diary[]> {
  if (!sel.diaries) return []
  const all = await getDB().diaries.orderBy('createdAt').toArray()
  return all.filter((d) => !d.hiddenAt && inRange(d.createdAt, sel))
}

export async function loadMessages(convKey: string): Promise<MessageRecord[]> {
  return getDB().messages.where('[convKey+seq]').between([convKey, -Infinity], [convKey, Infinity]).toArray()
}

type Attachment = Extract<Block, { type: 'attachment' }>

export function attachmentsOf(messages: Array<{ blocks: Block[] }>): Attachment[] {
  const out: Attachment[] = []
  for (const m of messages) for (const b of m.blocks) if (b.type === 'attachment') out.push(b)
  return out
}

/** 预估要导出多少内容,用来在导出前告诉用户"大概有多大" */
export async function planExport(sel: ExportSelection): Promise<ExportPlan> {
  const db = getDB()
  const conversations: ConversationRecord[] = []
  const diaries = await selectDiaries(sel)
  const days = new Set<string>()
  let messageCount = 0
  let imageCount = 0
  let imageBytes = 0
  let textBytes = 0
  const seenAssets = new Set<string>()

  for (const c of await selectConversations(sel)) {
    const msgs = (await loadMessages(c.key)).filter((m) => inRange(m.createdAt, sel))
    if (msgs.length === 0) continue
    conversations.push(c)
    messageCount += msgs.length
    for (const m of msgs) {
      days.add(dayKey(m.createdAt))
      for (const b of m.blocks) {
        if (b.type === 'text' || b.type === 'thinking') textBytes += b.text.length * 3
        else if (b.type === 'attachment' && b.assetKey && !seenAssets.has(b.assetKey)) {
          seenAssets.add(b.assetKey)
          const a = await db.assets.get(b.assetKey)
          if (a) {
            imageCount++
            imageBytes += a.size
          }
        }
      }
    }
  }
  for (const d of diaries) {
    days.add(dayKey(d.createdAt))
    textBytes += d.content.length * 3
  }
  return {
    conversations,
    diaries,
    messageCount,
    imageCount,
    imageBytes,
    textBytes,
    days: days.size,
    empty: conversations.length === 0 && diaries.length === 0,
  }
}
