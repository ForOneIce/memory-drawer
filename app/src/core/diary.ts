import { getDB } from './db'
import type { Diary } from './model'

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export interface NewDiary {
  content: string
  platformId?: string | null
  agentId?: string | null
  conversationKey?: string | null
}

export async function addDiary(input: NewDiary): Promise<Diary> {
  const content = input.content.trim()
  if (!content) throw new Error('empty')
  const diary: Diary = {
    id: newId(),
    createdAt: Date.now(),
    platformId: input.platformId ?? null,
    agentId: input.agentId ?? null,
    conversationKey: input.conversationKey ?? null,
    content,
    hiddenAt: null,
  }
  await getDB().diaries.put(diary)
  return diary
}

export async function listDiaries(opts: { query?: string; includeHidden?: boolean } = {}): Promise<Diary[]> {
  const all = await getDB().diaries.orderBy('createdAt').reverse().toArray()
  const terms = (opts.query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  return all.filter((d) => {
    if (!opts.includeHidden && d.hiddenAt) return false
    if (terms.length === 0) return true
    const lower = d.content.toLowerCase()
    return terms.every((t) => lower.includes(t))
  })
}

/** 收起(软删除),可以撤回 */
export async function hideDiary(id: string) {
  await getDB().diaries.update(id, { hiddenAt: Date.now() })
}

export async function restoreDiary(id: string) {
  await getDB().diaries.update(id, { hiddenAt: null })
}

export async function updateDiary(id: string, content: string) {
  const text = content.trim()
  if (!text) throw new Error('empty')
  await getDB().diaries.update(id, { content: text })
}
