import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openFromRaw } from '../../core/importer'
import { PrivacyGuardError, createSafeSource, rawFromMemory } from '../../core/source'
import { syntheticExport } from '../../test/fixtures'
import { allowPath, deepseekAdapter, parseSession } from './index'

describe('DeepSeek 隐私白名单', () => {
  it('只放行聊天内容、图片和 manifest', () => {
    expect(allowPath('manifest.json')).toBe(true)
    expect(allowPath('chat_sessions/abc.json')).toBe(true)
    expect(allowPath('chat_sessions/abc_files/x.png')).toBe(true)
    expect(allowPath('user.json')).toBe(false)
    expect(allowPath('chat_session_index.json')).toBe(false)
    expect(allowPath('chat_sessions/../user.json')).toBe(false)
    expect(allowPath('foo/user.json')).toBe(false)
  })

  it('读取 user.json 会被直接拒绝', async () => {
    const raw = syntheticExport()
    const safe = createSafeSource(raw, allowPath)
    expect(safe.has('user.json')).toBe(false)
    expect(safe.names()).not.toContain('user.json')
    await expect(safe.read('user.json')).rejects.toBeInstanceOf(PrivacyGuardError)
    await expect(safe.readJson('chat_session_index.json')).rejects.toBeInstanceOf(PrivacyGuardError)
    expect(raw.reads).not.toContain('user.json')
  })

  it('完整解析一遍之后,user.json 和索引文件都没有被读取过', async () => {
    const raw = syntheticExport()
    const opened = await openFromRaw(raw)
    const results = []
    for await (const r of opened.adapter.parse(opened.safe)) results.push(r)
    expect(results.length).toBe(3)
    expect(raw.reads).not.toContain('user.json')
    expect(raw.reads).not.toContain('chat_session_index.json')
    expect(raw.reads).toContain('manifest.json')
    expect(raw.reads.some((r) => r.startsWith('chat_sessions/'))).toBe(true)
  })
})

describe('DeepSeek 解析(合成数据)', () => {
  it('识别平台和版本,不读取内容之外的东西', async () => {
    const opened = await openFromRaw(syntheticExport())
    expect(opened.adapter.platform.id).toBe('deepseek')
    expect(opened.formatVersion).toBe('3')
    expect(opened.conversationCount).toBe(3)
  })

  it('不是 DeepSeek 的文件不会被认出来', async () => {
    await expect(openFromRaw(rawFromMemory({ 'readme.txt': 'hi' }))).rejects.toMatchObject({ reason: 'unknown-format' })
  })

  it('折叠片段、附件、通知和未知片段都被正确转换', async () => {
    const opened = await openFromRaw(syntheticExport())
    const out = []
    for await (const r of opened.adapter.parse(opened.safe)) if (!('failed' in r)) out.push(r)
    const c1 = out.find((o) => o.conversation.sourceId === 'aaaa-1111')!.conversation
    expect(c1.messages).toHaveLength(4)
    expect(c1.currentMessageId).toBe('4')
    const a = c1.messages.find((m) => m.id === '2')!
    expect(a.blocks.map((b) => b.type)).toEqual(['thinking', 'references', 'text'])
    const refs = a.blocks[1]
    expect(refs.type === 'references' && refs.items.length).toBe(2)
    const att = c1.messages[0].blocks.filter((b) => b.type === 'attachment')
    expect(att).toHaveLength(2)

    const c2 = out.find((o) => o.conversation.sourceId === 'bbbb-2222')!.conversation
    expect(c2.messages[1].status).toBe('timeout')
    expect(c2.messages[1].blocks).toEqual([{ type: 'notice', kind: 'busy' }])

    const c3 = out.find((o) => o.conversation.sourceId === 'cccc-3333')!
    expect(c3.warnings).toBe(1)
    const types = c3.conversation.messages[1].blocks.map((b) => b.type)
    expect(types).toContain('unknown')
    expect(types).toContain('notice')
  })

  it('损坏的会话文件只会跳过自己', async () => {
    const raw = rawFromMemory({
      'manifest.json': '{"export_format_version":3}',
      'chat_sessions/ok.json': JSON.stringify({ id: 'ok', messages: [] }),
      'chat_sessions/bad.json': '{ not json',
    })
    const opened = await openFromRaw(raw)
    const results = []
    for await (const r of opened.adapter.parse(opened.safe)) results.push(r)
    expect(results.filter((r) => 'failed' in r)).toHaveLength(1)
    expect(results.filter((r) => !('failed' in r))).toHaveLength(1)
  })

  it('没有 title、没有 current_message_id 时有合理的兜底', () => {
    const { conversation } = parseSession({
      id: 'x',
      messages: [
        { id: '1', parent_id: null, role: 'USER', status: 'FINISHED', inserted_at: '2026-01-01T00:00:00Z', fragments: [{ type: 'REQUEST', content: '这是第一句话' }] },
        { id: '2', parent_id: '1', role: 'ASSISTANT', status: 'FINISHED', inserted_at: '2026-01-01T00:00:01Z', fragments: [] },
      ],
    })
    expect(conversation.title).toBe('这是第一句话')
    expect(conversation.currentMessageId).toBe('2')
  })
})

// ---- 真实样本(本机上有才跑) ----
// 样本放在项目根目录的 testdata/deepseek*/ 下(该目录已被 .gitignore 忽略,属于个人测试数据)
function findSample(): string {
  const base = join(__dirname, '../../../../testdata')
  if (!existsSync(base)) return base
  const hit = readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.toLowerCase().startsWith('deepseek'))
    .map((d) => join(base, d.name))
    .find((p) => existsSync(join(p, 'chat_sessions')))
  return hit ?? base
}
const sample = findSample()
describe.skipIf(!existsSync(join(sample, 'chat_sessions')))('DeepSeek 真实导出样本', () => {
  it('样本里的会话全部能解析,且没有读取账号信息', async () => {
    const dir = join(sample, 'chat_sessions')
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    const entries: Record<string, string | Uint8Array> = {
      'manifest.json': readFileSync(join(sample, 'manifest.json'), 'utf8'),
      'user.json': readFileSync(join(sample, 'user.json'), 'utf8'),
      'chat_session_index.json': readFileSync(join(sample, 'chat_session_index.json'), 'utf8'),
    }
    for (const f of files) entries[`chat_sessions/${f}`] = readFileSync(join(dir, f), 'utf8')
    const raw = rawFromMemory(entries)
    const opened = await openFromRaw(raw)
    expect(opened.conversationCount).toBe(files.length)

    let ok = 0
    let failed = 0
    let messages = 0
    for await (const r of deepseekAdapter.parse(opened.safe)) {
      if ('failed' in r) failed++
      else {
        ok++
        messages += r.conversation.messages.length
        expect(r.conversation.currentMessageId).not.toBeNull()
      }
    }
    expect(failed).toBe(0)
    expect(ok).toBe(files.length)
    expect(messages).toBeGreaterThan(0)
    expect(raw.reads).not.toContain('user.json')
    expect(raw.reads).not.toContain('chat_session_index.json')
  }, 120_000)
})
