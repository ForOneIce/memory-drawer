import type { Block, Conversation, Message, MessageStatus, ReferenceItem } from '../../core/model'
import { makeConversationKey } from '../../core/model'
import type { ParsedConversation, PlatformAdapter, PlatformInspect, ParseProgress } from '../../core/platform'
import type { SafeSource } from '../../core/source'
import { deepseekGuide } from './guide'

export const DEEPSEEK_ID = 'deepseek'
export const DEEPSEEK_AGENT_ID = 'default'

const SESSION_RE = /^chat_sessions\/[^/]+\.json$/
const ASSET_RE = /^chat_sessions\/[^/]+_files\/[^/]+$/

/**
 * 隐私白名单。只有这三类路径允许被读取:
 *   - manifest.json(只取版本号)
 *   - chat_sessions/<id>.json(聊天内容)
 *   - chat_sessions/<id>_files/*(用户自己上传的图片)
 * 账号信息文件 user.json、会话索引 chat_session_index.json 等一律不读。
 */
export function allowPath(path: string): boolean {
  return path === 'manifest.json' || SESSION_RE.test(path) || ASSET_RE.test(path)
}

const STATUS_MAP: Record<string, MessageStatus> = {
  TIMEOUT: 'timeout',
  INCOMPLETE: 'incomplete',
  CONTENT_FILTER: 'filtered',
}

/** 已知但不需要展示的片段 */
const IGNORED = new Set(['CONTENT_RISK', 'PARTIAL_FILE_READ', 'TOOL_IMAGE_SEARCH'])

interface RawFragment {
  type?: string
  content?: unknown
  elapsed_secs?: unknown
  queries?: unknown
  results?: unknown
  url?: unknown
  title?: unknown
  snippet?: unknown
  site_name?: unknown
  published_at?: unknown
  files?: unknown
  [k: string]: unknown
}

interface RawMessage {
  id?: unknown
  parent_id?: unknown
  role?: unknown
  status?: unknown
  inserted_at?: unknown
  fragments?: unknown
}

interface RawSession {
  id?: unknown
  title?: unknown
  inserted_at?: unknown
  updated_at?: unknown
  current_message_id?: unknown
  messages?: unknown
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const time = (v: unknown, fallback = 0): number => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN
  return Number.isFinite(t) ? t : fallback
}

function toReference(o: unknown): ReferenceItem | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const url = str(r.url)
  if (!url) return null
  return {
    url,
    title: str(r.title) ?? url,
    snippet: str(r.snippet),
    site: str(r.site_name),
    publishedAt: str(r.published_at),
  }
}

export function parseMessage(raw: RawMessage, counters: { warnings: number }): Message {
  const status = STATUS_MAP[String(raw.status ?? '')] ?? 'ok'
  const blocks: Block[] = []
  const refs: ReferenceItem[] = []
  const queries: string[] = []
  let refIndex = -1

  const pushRef = (item: ReferenceItem | null) => {
    if (!item || refs.some((r) => r.url === item.url)) return
    refs.push(item)
  }

  for (const f of arr(raw.fragments) as RawFragment[]) {
    const type = String(f?.type ?? '')
    switch (type) {
      case 'REQUEST':
      case 'RESPONSE': {
        const text = str(f.content)
        if (text !== undefined) blocks.push({ type: 'text', text })
        break
      }
      case 'THINK': {
        const text = str(f.content)
        if (text !== undefined) blocks.push({ type: 'thinking', text, seconds: num(f.elapsed_secs) })
        break
      }
      case 'TOOL_SEARCH':
      case 'TOOL_OPEN':
      case 'READ_LINK': {
        if (refIndex < 0) {
          refIndex = blocks.length
          blocks.push({ type: 'references', items: [] }) // 占位,最后回填
        }
        if (type === 'TOOL_SEARCH') {
          for (const q of arr(f.queries)) if (typeof q === 'string' && !queries.includes(q)) queries.push(q)
          for (const r of arr(f.results)) pushRef(toReference(r))
        } else if (type === 'TOOL_OPEN') {
          pushRef(toReference(f))
        } else {
          for (const r of arr(f.results)) pushRef(toReference(r))
        }
        break
      }
      case 'FILE': {
        for (const file of arr(f.files)) {
          if (!file || typeof file !== 'object') continue
          const o = file as Record<string, unknown>
          blocks.push({
            type: 'attachment',
            fileName: str(o.file_name) ?? '未命名的文件',
            size: num(o.file_size),
            isImage: o.is_image === true,
            width: num(o.width),
            height: num(o.height),
            sourcePath: str(o.export_path),
          })
        }
        break
      }
      case 'TEMPLATE_RESPONSE': {
        // 平台的系统模板话术("服务器繁忙"等)不原样展示,转成温和的提示
        blocks.push({ type: 'notice', kind: status === 'filtered' ? 'filtered' : 'busy' })
        break
      }
      default: {
        if (IGNORED.has(type)) break
        counters.warnings++
        blocks.push({ type: 'unknown', rawType: type || '(空)', raw: f })
      }
    }
  }

  if (refIndex >= 0) {
    if (refs.length === 0 && queries.length === 0) blocks.splice(refIndex, 1)
    else blocks[refIndex] = { type: 'references', items: refs, queries: queries.length ? queries : undefined }
  }

  const hasNotice = blocks.some((b) => b.type === 'notice')
  if (!hasNotice) {
    if (status === 'timeout') blocks.push({ type: 'notice', kind: 'timeout' })
    else if (status === 'incomplete') blocks.push({ type: 'notice', kind: 'incomplete' })
    else if (status === 'filtered') blocks.push({ type: 'notice', kind: 'filtered' })
  }

  const role = String(raw.role ?? '').toUpperCase() === 'USER' ? 'user' : 'assistant'
  const parent = raw.parent_id
  return {
    id: String(raw.id ?? ''),
    parentId: parent === null || parent === undefined || parent === '' ? null : String(parent),
    role,
    createdAt: time(raw.inserted_at),
    status,
    blocks,
  }
}

export function parseSession(raw: RawSession): ParsedConversation {
  const counters = { warnings: 0 }
  const sourceId = String(raw.id ?? '')
  if (!sourceId) throw new Error('会话缺少 id')
  const messages = arr(raw.messages)
    .filter((m): m is RawMessage => !!m && typeof m === 'object')
    .map((m) => parseMessage(m, counters))
    .filter((m) => m.id !== '')

  const createdAt = time(raw.inserted_at, messages[0]?.createdAt ?? 0)
  const updatedAt = time(raw.updated_at, messages[messages.length - 1]?.createdAt ?? createdAt)

  let current = raw.current_message_id === null || raw.current_message_id === undefined ? null : String(raw.current_message_id)
  if (current !== null && !messages.some((m) => m.id === current)) current = null
  if (current === null && messages.length) current = messages[messages.length - 1].id

  const firstUser = messages.find((m) => m.role === 'user')
  const firstText = firstUser?.blocks.find((b) => b.type === 'text')
  const fallbackTitle = firstText && firstText.type === 'text' ? firstText.text.replace(/\s+/g, ' ').slice(0, 24) : ''

  const conversation: Conversation = {
    key: makeConversationKey(DEEPSEEK_ID, DEEPSEEK_AGENT_ID, sourceId),
    platformId: DEEPSEEK_ID,
    agentId: DEEPSEEK_AGENT_ID,
    sourceId,
    title: str(raw.title) ?? (fallbackTitle || ''),
    createdAt,
    updatedAt,
    currentMessageId: current,
    messages,
  }
  return { conversation, warnings: counters.warnings }
}

async function inspect(src: SafeSource): Promise<PlatformInspect> {
  let formatVersion = 'unknown'
  if (src.has('manifest.json')) {
    try {
      const m = await src.readJson<{ export_format_version?: unknown }>('manifest.json')
      if (m.export_format_version !== undefined) formatVersion = String(m.export_format_version)
    } catch {
      /* 版本读不出来也不阻止导入 */
    }
  }
  return {
    formatVersion,
    conversationCount: src.names().filter((n) => SESSION_RE.test(n)).length,
  }
}

async function* parse(
  src: SafeSource,
  onProgress?: (p: ParseProgress) => void,
  signal?: AbortSignal,
): AsyncGenerator<ParsedConversation | { failed: string }, void, void> {
  const files = src.names().filter((n) => SESSION_RE.test(n)).sort()
  let done = 0
  for (const path of files) {
    if (signal?.aborted) return
    try {
      const raw = await src.readJson<RawSession>(path)
      yield parseSession(raw)
    } catch {
      yield { failed: path }
    }
    done++
    onProgress?.({ done, total: files.length })
    // 让出主线程,保证界面流畅
    await new Promise((r) => setTimeout(r, 0))
  }
}

export const deepseekAdapter: PlatformAdapter = {
  platform: { id: DEEPSEEK_ID, name: 'DeepSeek' },
  agents: [{ id: DEEPSEEK_AGENT_ID, platformId: DEEPSEEK_ID, name: 'DeepSeek' }],
  icon: 'icons/deepseek-192.png',
  accent: '#3F6FE0',
  rootMarkers: ['manifest.json', 'chat_sessions/'],
  detectByNames: (names) => names.some((n) => SESSION_RE.test(n)),
  allowPath,
  inspect,
  parse,
  guide: deepseekGuide,
}
