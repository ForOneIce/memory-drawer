import Dexie, { type Table } from 'dexie'
import type { AssetRecord, ConversationRecord, Diary, MessageRecord } from './model'

/**
 * 本地数据库。
 * 约定:数据库升级只"新增"表或字段,不重命名、不删除,保证旧数据永远读得出来。
 * 日记(diaries)是独立的表,不依赖聊天数据,重新导入聊天记录不会碰它。
 */
export class MemoryDB extends Dexie {
  conversations!: Table<ConversationRecord, string>
  messages!: Table<MessageRecord, string>
  assets!: Table<AssetRecord, string>
  diaries!: Table<Diary, string>

  constructor(name = 'memory-drawer') {
    super(name)
    this.version(1).stores({
      conversations: 'key, platformId, agentId, updatedAt, createdAt',
      messages: 'key, convKey, [convKey+seq], createdAt',
      assets: 'key, convKey',
      diaries: 'id, createdAt, platformId, agentId, conversationKey',
    })
  }
}

let instance: MemoryDB | null = null

export function getDB(): MemoryDB {
  if (!instance) instance = new MemoryDB()
  return instance
}

/** 测试时替换数据库 */
export function setDB(db: MemoryDB | null) {
  instance = db
}
