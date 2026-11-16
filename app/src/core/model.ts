/**
 * 统一内部模型。所有平台的解析结果都落到这里,新增平台不改这个文件的既有字段(只增不改)。
 */

export const SCHEMA_VERSION = 1
export const APP_VERSION = '0.1.0'

export type Role = 'user' | 'assistant'

/** 消息状态:用于温和地展示"那一刻没能来得及回应"之类的情况 */
export type MessageStatus = 'ok' | 'timeout' | 'incomplete' | 'filtered'

export interface ReferenceItem {
  url: string
  title: string
  snippet?: string
  site?: string
  publishedAt?: string
}

export type NoticeKind = 'timeout' | 'incomplete' | 'filtered' | 'busy'

export type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string; seconds?: number }
  | { type: 'references'; items: ReferenceItem[]; queries?: string[] }
  | {
      type: 'attachment'
      fileName: string
      size?: number
      isImage: boolean
      width?: number
      height?: number
      /** 在导出包里的相对路径(仅解析阶段使用) */
      sourcePath?: string
      /** 导入后在本地 assets 表里的 key;找不到文件时为空 */
      assetKey?: string
      missing?: boolean
    }
  | { type: 'notice'; kind: NoticeKind }
  /** 没认出来的片段:原样保留,不丢数据 */
  | { type: 'unknown'; rawType: string; raw: unknown }

export interface Message {
  /** 平台内的消息 id */
  id: string
  parentId: string | null
  role: Role
  createdAt: number
  status: MessageStatus
  blocks: Block[]
}

export interface Conversation {
  /** 全局唯一:platformId:agentId:sourceId */
  key: string
  platformId: string
  agentId: string
  sourceId: string
  title: string
  createdAt: number
  updatedAt: number
  /** 当前主线的最后一条消息 id */
  currentMessageId: string | null
  messages: Message[]
}

/** 存进 IndexedDB 的会话概要 */
export interface ConversationRecord {
  key: string
  platformId: string
  agentId: string
  sourceId: string
  title: string
  createdAt: number
  updatedAt: number
  currentMessageId: string | null
  messageCount: number
  preview: string
  /** 收起时间(软删除),空表示正常显示 */
  hiddenAt?: number | null
}

export interface MessageRecord extends Message {
  /** convKey/messageId */
  key: string
  convKey: string
  /** 在会话中的顺序 */
  seq: number
}

export interface AssetRecord {
  key: string
  convKey: string
  fileName: string
  mime: string
  size: number
  width?: number
  height?: number
  blob: Blob
  thumb?: Blob
}

export interface Platform {
  id: string
  name: string
}

export interface Agent {
  id: string
  platformId: string
  name: string
}

export interface Diary {
  id: string
  createdAt: number
  /** 对象可以为空(在备忘录里写的日记可以不选对象) */
  platformId?: string | null
  agentId?: string | null
  conversationKey?: string | null
  content: string
  hiddenAt?: number | null
}

export type ThemeId = 'calm' | 'relax' | 'miss' | 'joy' | 'night'

export function messageText(m: Pick<Message, 'blocks'>): string {
  return m.blocks
    .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

export function makeConversationKey(platformId: string, agentId: string, sourceId: string): string {
  return `${platformId}:${agentId}:${sourceId}`
}
