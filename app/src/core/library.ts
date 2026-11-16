import { getDB } from './db'
import { invalidateSearch } from './search'

/**
 * 收起 ≠ 移除。
 * 收起只是给会话打上"收起时间",内容原样留在这台设备里,随时可以放回来。
 * 彻底移除才会真正把内容从这台设备上拿走,界面上必须经过二次确认。
 */
export async function hideConversation(key: string) {
  await getDB().conversations.update(key, { hiddenAt: Date.now() })
  invalidateSearch()
}

export async function restoreConversation(key: string) {
  await getDB().conversations.update(key, { hiddenAt: null })
  invalidateSearch()
}

/** 彻底移除一段回忆:会话、消息和图片一起拿走。不可撤回(备份包里的副本不受影响) */
export async function removeConversation(key: string) {
  const db = getDB()
  await db.transaction('rw', db.conversations, db.messages, db.assets, async () => {
    await db.messages.where('convKey').equals(key).delete()
    await db.assets.where('convKey').equals(key).delete()
    await db.conversations.delete(key)
  })
  invalidateSearch()
}

/** 彻底移除一页心情。日记里记录的"来自哪段回忆"只是引用,不受影响 */
export async function removeDiary(id: string) {
  await getDB().diaries.delete(id)
}
