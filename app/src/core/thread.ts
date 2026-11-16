import type { Message } from './model'

/** 沿着 parentId 从 leaf 回溯到根,得到当前主线(按时间从早到晚) */
export function resolveThread(messages: Message[], leafId: string | null): Message[] {
  if (messages.length === 0) return []
  const byId = new Map(messages.map((m) => [m.id, m]))
  const leaf = leafId && byId.has(leafId) ? leafId : messages[messages.length - 1].id
  const path: Message[] = []
  const seen = new Set<string>()
  let cur: Message | undefined = byId.get(leaf)
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    path.push(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  path.reverse()
  // 若数据里没有 parentId 关系(只有一条链),退回到按原顺序展示
  if (path.length === 1 && messages.length > 1 && messages.every((m) => m.parentId === null)) return messages
  return path
}

/** 同一个父消息下的兄弟分支(含自己),按原顺序 */
export function siblingsOf(messages: Message[], message: Message): Message[] {
  return messages.filter((m) => m.parentId === message.parentId)
}

/** 从某条消息出发,一路沿"最新的子消息"走到末端,得到该分支的叶子 */
export function latestLeaf(messages: Message[], fromId: string): string {
  const children = new Map<string | null, Message[]>()
  for (const m of messages) {
    const list = children.get(m.parentId) ?? []
    list.push(m)
    children.set(m.parentId, list)
  }
  let cur = fromId
  const seen = new Set<string>()
  while (!seen.has(cur)) {
    seen.add(cur)
    const kids = children.get(cur)
    if (!kids || kids.length === 0) break
    cur = kids[kids.length - 1].id
  }
  return cur
}

/** 主线上存在多个分支的位置 */
export interface BranchPoint {
  messageId: string
  index: number
  total: number
  siblings: string[]
}

export function branchPoints(messages: Message[], thread: Message[]): Map<string, BranchPoint> {
  const out = new Map<string, BranchPoint>()
  for (const m of thread) {
    const sib = siblingsOf(messages, m)
    if (sib.length > 1) {
      out.set(m.id, {
        messageId: m.id,
        index: sib.findIndex((s) => s.id === m.id),
        total: sib.length,
        siblings: sib.map((s) => s.id),
      })
    }
  }
  return out
}
