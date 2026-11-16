import { getDB } from './db'
import { messageText, type Role } from './model'

interface IndexItem {
  convKey: string
  messageId: string
  platformId: string
  agentId: string
  role: Role
  createdAt: number
  text: string
  lower: string
}

export interface SearchQuery {
  q: string
  /** 起始时间(含) */
  from?: number
  /** 结束时间(不含) */
  to?: number
  platformId?: string
  agentId?: string
  role?: Role | 'any'
}

export interface SearchHit {
  convKey: string
  messageId: string
  platformId: string
  agentId: string
  role: Role
  createdAt: number
  snippet: string
  /** snippet 内的命中区间,用来高亮 */
  marks: Array<[number, number]>
}

let cache: IndexItem[] | null = null
let building: Promise<IndexItem[]> | null = null

export function invalidateSearch() {
  cache = null
  building = null
}

async function build(): Promise<IndexItem[]> {
  const db = getDB()
  const convs = await db.conversations.toArray()
  const meta = new Map(convs.map((c) => [c.key, c]))
  const items: IndexItem[] = []
  await db.messages.each((m) => {
    const c = meta.get(m.convKey)
    if (!c) return
    const text = messageText(m)
    if (!text) return
    items.push({
      convKey: m.convKey,
      messageId: m.id,
      platformId: c.platformId,
      agentId: c.agentId,
      role: m.role,
      createdAt: m.createdAt,
      text,
      lower: text.toLowerCase(),
    })
  })
  return items
}

async function getIndex(): Promise<IndexItem[]> {
  if (cache) return cache
  if (!building) building = build().then((r) => (cache = r))
  return building
}

export function splitTerms(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

export function makeSnippet(text: string, terms: string[], radius = 36): { snippet: string; marks: Array<[number, number]> } {
  const lower = text.toLowerCase()
  let first = -1
  for (const t of terms) {
    const i = lower.indexOf(t)
    if (i >= 0 && (first < 0 || i < first)) first = i
  }
  const flat = (s: string) => s.replace(/\s+/g, ' ')
  if (first < 0) return { snippet: flat(text.slice(0, radius * 2)), marks: [] }
  const start = Math.max(0, first - radius)
  const end = Math.min(text.length, first + radius * 2)
  const raw = text.slice(start, end)
  // 折叠空白后,命中位置需要重新计算
  const snippetBody = flat(raw)
  const snippetLower = snippetBody.toLowerCase()
  const marks: Array<[number, number]> = []
  for (const t of terms) {
    let from = 0
    for (;;) {
      const i = snippetLower.indexOf(t, from)
      if (i < 0) break
      marks.push([i, i + t.length])
      from = i + t.length
    }
  }
  marks.sort((a, b) => a[0] - b[0])
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return {
    snippet: prefix + snippetBody + suffix,
    marks: marks.map(([a, b]) => [a + prefix.length, b + prefix.length] as [number, number]),
  }
}

export async function searchMessages(query: SearchQuery, limit = 300): Promise<SearchHit[]> {
  const terms = splitTerms(query.q)
  const hasFilter = query.from !== undefined || query.to !== undefined
  if (terms.length === 0 && !hasFilter) return []
  const db = getDB()
  const hidden = new Set((await db.conversations.toArray()).filter((c) => c.hiddenAt).map((c) => c.key))
  const index = await getIndex()
  const hits: SearchHit[] = []
  for (const it of index) {
    if (hidden.has(it.convKey)) continue
    if (query.platformId && it.platformId !== query.platformId) continue
    if (query.agentId && it.agentId !== query.agentId) continue
    if (query.role && query.role !== 'any' && it.role !== query.role) continue
    if (query.from !== undefined && it.createdAt < query.from) continue
    if (query.to !== undefined && it.createdAt >= query.to) continue
    if (!terms.every((t) => it.lower.includes(t))) continue
    const { snippet, marks } = makeSnippet(it.text, terms)
    hits.push({
      convKey: it.convKey,
      messageId: it.messageId,
      platformId: it.platformId,
      agentId: it.agentId,
      role: it.role,
      createdAt: it.createdAt,
      snippet,
      marks,
    })
  }
  hits.sort((a, b) => b.createdAt - a.createdAt)
  return hits.slice(0, limit)
}
