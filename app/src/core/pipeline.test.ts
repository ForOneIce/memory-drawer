import 'fake-indexeddb/auto'
import { unzipSync } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'
import { syntheticExport } from '../test/fixtures'
import { addDiary, hideDiary, listDiaries, restoreDiary } from './diary'
import { MemoryDB, setDB, getDB } from './db'
import { BackupError, buildBackup, importBackup } from './export/backup'
import { planExport } from './export/collect'
import { ExportCancelled, buildHtmlExport } from './export/html'
import { importFromSource, openFromRaw } from './importer'
import { hideConversation, removeConversation, removeDiary, restoreConversation } from './library'
import { invalidateSearch, searchMessages } from './search'

let n = 0
beforeEach(() => {
  setDB(new MemoryDB(`test-${++n}`))
  invalidateSearch()
})

async function doImport() {
  const opened = await openFromRaw(syntheticExport())
  return importFromSource(opened)
}

describe('导入', () => {
  it('写入会话、消息和图片', async () => {
    const r = await doImport()
    expect(r).toMatchObject({ added: 3, updated: 0, skipped: 0, failed: 0, images: 1, missingImages: 1 })
    const db = getDB()
    expect(await db.conversations.count()).toBe(3)
    expect(await db.messages.count()).toBe(8)
    expect(await db.assets.count()).toBe(1)
    const msg = await db.messages.get('deepseek:default:aaaa-1111/1')
    const atts = msg!.blocks.filter((b) => b.type === 'attachment')
    expect(atts[0]).toMatchObject({ assetKey: 'deepseek:default:aaaa-1111/f1_小猫.png' })
    expect(atts[1]).toMatchObject({ missing: true })
    // 文档类附件只保留文件名,不算"图片缺失"
    const doc = await db.messages.get('deepseek:default:bbbb-2222/1')
    expect(doc!.blocks.find((b) => b.type === 'attachment')).toMatchObject({ fileName: '表格.xlsx', isImage: false })
    expect(doc!.blocks.find((b) => b.type === 'attachment')).not.toHaveProperty('missing')
  })

  it('重复导入不会产生重复内容,日记也不受影响', async () => {
    await doImport()
    await addDiary({ content: '今天想起了它' })
    const r = await doImport()
    expect(r).toMatchObject({ added: 0, updated: 0, skipped: 3 })
    expect(await getDB().messages.count()).toBe(8)
    expect(await listDiaries()).toHaveLength(1)
  })

  it('已经收藏的内容在平台那边没有了,这里依然保留(取并集)', async () => {
    await doImport()
    // 模拟:新的导出里,会话 aaaa-1111 只剩 2 条消息,并且更新了时间
    const raw = syntheticExport()
    const small = JSON.parse(new TextDecoder().decode(await raw.read('chat_sessions/aaaa-1111.json')))
    small.messages = small.messages.slice(0, 2)
    small.updated_at = '2026-06-01T00:00:00.000Z'
    const { rawFromMemory } = await import('./source')
    const opened = await openFromRaw(
      rawFromMemory({
        'manifest.json': '{"export_format_version":3}',
        'chat_sessions/aaaa-1111.json': JSON.stringify(small),
      }),
    )
    const r = await importFromSource(opened)
    expect(r.updated).toBe(1)
    expect(await getDB().messages.where('convKey').equals('deepseek:default:aaaa-1111').count()).toBe(4)
  })
})

describe('搜索与筛选', () => {
  it('关键词、时间、说话者', async () => {
    await doImport()
    expect((await searchMessages({ q: '公园' })).map((h) => h.messageId)).toEqual(['2'])
    expect((await searchMessages({ q: '周末 咖啡' })).length).toBe(0)
    expect((await searchMessages({ q: '咖啡馆' })).length).toBe(1)
    const march = await searchMessages({ q: '', from: new Date(2026, 2, 1).getTime(), to: new Date(2026, 3, 1).getTime() })
    expect(march.length).toBeGreaterThanOrEqual(3)
    const mine = await searchMessages({ q: '在吗', role: 'user' })
    expect(mine).toHaveLength(1)
    expect(await searchMessages({ q: '在吗', role: 'assistant' })).toHaveLength(0)
    expect(await searchMessages({ q: '', })).toEqual([])
  })

  it('收起的会话不会出现在搜索里,放回来之后又可以了', async () => {
    await doImport()
    const db = getDB()
    await db.conversations.update('deepseek:default:bbbb-2222', { hiddenAt: Date.now() })
    expect(await searchMessages({ q: '在吗' })).toHaveLength(0)
    await db.conversations.update('deepseek:default:bbbb-2222', { hiddenAt: null })
    expect(await searchMessages({ q: '在吗' })).toHaveLength(1)
  })
})

describe('收起与彻底移除', () => {
  const key = 'deepseek:default:aaaa-1111'
  it('收起不会动内容,放回来一切照旧', async () => {
    await doImport()
    const db = getDB()
    const before = await db.messages.where('convKey').equals(key).count()
    await hideConversation(key)
    expect((await db.conversations.get(key))!.hiddenAt).toBeTruthy()
    expect(await db.messages.where('convKey').equals(key).count()).toBe(before)
    expect(await db.assets.count()).toBe(1)
    await restoreConversation(key)
    expect((await db.conversations.get(key))!.hiddenAt).toBeNull()
  })
  it('彻底移除只拿走这一段回忆的会话、消息和图片', async () => {
    await doImport()
    const db = getDB()
    await removeConversation(key)
    expect(await db.conversations.get(key)).toBeUndefined()
    expect(await db.messages.where('convKey').equals(key).count()).toBe(0)
    expect(await db.assets.where('convKey').equals(key).count()).toBe(0)
    expect(await db.conversations.count()).toBe(2)
    expect(await db.messages.count()).toBe(8 - 4)
    expect(await searchMessages({ q: '公园' })).toHaveLength(0)
  })
  it('彻底移除日记', async () => {
    const a = await addDiary({ content: '一页心情' })
    await removeDiary(a.id)
    expect(await listDiaries({ includeHidden: true })).toHaveLength(0)
  })
})

describe('心情日记', () => {
  it('聊天内的日记绑定对象,备忘录里的可以不选对象', async () => {
    const a = await addDiary({ content: ' 想你了 ', platformId: 'deepseek', agentId: 'default', conversationKey: 'k' })
    const b = await addDiary({ content: '今天天气很好' })
    expect(a.content).toBe('想你了')
    expect(a.platformId).toBe('deepseek')
    expect(b.platformId).toBeNull()
    await expect(addDiary({ content: '   ' })).rejects.toThrow()
  })
  it('收起可以撤回,搜索可用', async () => {
    const a = await addDiary({ content: '今天很开心' })
    await hideDiary(a.id)
    expect(await listDiaries()).toHaveLength(0)
    expect(await listDiaries({ includeHidden: true })).toHaveLength(1)
    await restoreDiary(a.id)
    expect(await listDiaries({ query: '开心' })).toHaveLength(1)
    expect(await listDiaries({ query: '难过' })).toHaveLength(0)
  })
})

describe('手账风网页导出', () => {
  it('内容全部转义,不含脚本和外部请求', async () => {
    await doImport()
    await addDiary({ content: '<script>alert("日记")</script>' })
    const out = await buildHtmlExport({
      sel: { chats: true, diaries: true },
      themeId: 'calm',
      withImages: true,
      withThinking: true,
    })
    expect(out.kind).toBe('html')
    const html = await out.blob.text()
    expect(html).not.toContain('<script')
    expect(html).not.toMatch(/<img[^>]+onerror/i)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('Content-Security-Policy')
    // 图片被内嵌,没有任何 http 的 src/href 之外的资源引用(链接只在用户点击时才会打开)
    expect(html).toContain('data:image')
    expect(html).not.toMatch(/<(img|link|script|iframe)[^>]+src="https?:/i)
    expect(html).not.toMatch(/<link[^>]+href=/i)
    // 异常状态是温和的文案
    expect(html).toContain('那一刻,TA 没能来得及回应')
    expect(html).not.toContain('服务器繁忙')
    // 缺失的图片
    expect(html).toContain('没能随导出一起保存')
    expect(out.stats).toMatchObject({ conversations: 3, diaries: 1 })
    expect(out.filename.endsWith('.html')).toBe(true)
  })

  it('不带图片、不带小心思', async () => {
    await doImport()
    const out = await buildHtmlExport({ sel: { chats: true, diaries: false }, themeId: 'night', withImages: false, withThinking: false })
    const html = await out.blob.text()
    expect(html).not.toContain('data:image')
    expect(html).not.toContain('先想想有什么推荐')
    expect(html).not.toContain('郊游指南')
    expect(html).toContain('这次没有带上')
    expect(html).toContain('data-theme="night"')
  })

  it('强制分卷时得到 zip:目录页、按年网页、图片文件夹', async () => {
    await doImport()
    const out = await buildHtmlExport({ sel: { chats: true, diaries: false }, themeId: 'joy', withImages: true, withThinking: true, mode: 'zip' })
    expect(out.kind).toBe('zip')
    const files = unzipSync(new Uint8Array(await out.blob.arrayBuffer()))
    const names = Object.keys(files)
    expect(names.some((x) => x.endsWith('从这里开始.html'))).toBe(true)
    expect(names.some((x) => x.endsWith('回忆-2026.html'))).toBe(true)
    expect(names.some((x) => x.includes('/images/'))).toBe(true)
  })

  it('时间范围只导出范围内的内容;没有内容时给出明确提示', async () => {
    await doImport()
    const sel = { chats: true, diaries: false, from: new Date(2026, 3, 1).getTime(), to: new Date(2026, 4, 1).getTime() }
    const plan = await planExport(sel)
    expect(plan.conversations).toHaveLength(1)
    const empty = await planExport({ chats: true, diaries: false, from: new Date(2030, 0, 1).getTime() })
    expect(empty.empty).toBe(true)
    await expect(buildHtmlExport({ sel: { chats: true, diaries: false, from: new Date(2030, 0, 1).getTime() }, themeId: 'calm', withImages: false, withThinking: false })).rejects.toThrow()
  })

  it('可以取消', async () => {
    await doImport()
    const ctl = new AbortController()
    ctl.abort()
    await expect(
      buildHtmlExport({ sel: { chats: true, diaries: false }, themeId: 'calm', withImages: false, withThinking: false }, undefined, ctl.signal),
    ).rejects.toBeInstanceOf(ExportCancelled)
  })

  it('会话标题里的特殊字符被转义', async () => {
    await doImport()
    const out = await buildHtmlExport({ sel: { chats: true, diaries: false }, themeId: 'calm', withImages: false, withThinking: false })
    const html = await out.blob.text()
    expect(html).toContain('周末去哪儿 &lt;script&gt;alert(1)&lt;/script&gt;')
  })
})

describe('备份包', () => {
  it('导出再导入,内容完全一致;重复导入不重复', async () => {
    await doImport()
    await addDiary({ content: '写给自己的话', platformId: 'deepseek', agentId: 'default' })
    const out = await buildBackup({ sel: { chats: true, diaries: true }, withImages: true })
    expect(out.filename.endsWith('.zip')).toBe(true)

    const names = Object.keys(unzipSync(new Uint8Array(await out.blob.arrayBuffer())))
    expect(names).toContain('manifest.json')
    expect(names).toContain('data.json')
    expect(names.some((x) => x.startsWith('assets/'))).toBe(true)
    expect(names).not.toContain('user.json')

    const before = {
      convs: await getDB().conversations.count(),
      msgs: await getDB().messages.count(),
    }
    // 换一个全新的设备
    setDB(new MemoryDB(`test-restore-${++n}`))
    const r = await importBackup(out.blob)
    expect(r).toMatchObject({ conversations: 3, diaries: 1, assets: 1, damagedAssets: 0 })
    expect(await getDB().conversations.count()).toBe(before.convs)
    expect(await getDB().messages.count()).toBe(before.msgs)
    expect(await getDB().assets.count()).toBe(1)
    expect((await listDiaries())[0].content).toBe('写给自己的话')

    const again = await importBackup(out.blob)
    expect(again).toMatchObject({ conversations: 0, skippedConversations: 3, diaries: 0, skippedDiaries: 1 })
    expect(await getDB().messages.count()).toBe(before.msgs)
  })

  it('不带图片的备份,导入后图片位置用说明代替', async () => {
    await doImport()
    const out = await buildBackup({ sel: { chats: true, diaries: false }, withImages: false })
    setDB(new MemoryDB(`test-noimg-${++n}`))
    const r = await importBackup(out.blob)
    expect(r.assets).toBe(0)
    expect(await getDB().assets.count()).toBe(0)
  })

  it('不是备份包 / 版本太新 / 被损坏,都会温和拒绝且不写入任何内容', async () => {
    await doImport()
    const out = await buildBackup({ sel: { chats: true, diaries: false }, withImages: false })
    const files = unzipSync(new Uint8Array(await out.blob.arrayBuffer()))
    const { zipSync, strToU8 } = await import('fflate')

    setDB(new MemoryDB(`test-bad-${++n}`))

    await expect(importBackup(new Blob(['hello']))).rejects.toMatchObject({ reason: 'not-backup' })
    await expect(importBackup(new Blob([zipSync({ 'a.txt': strToU8('x') })]))).rejects.toMatchObject({ reason: 'not-backup' })

    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']))
    const tooNew = zipSync({ ...files, 'manifest.json': strToU8(JSON.stringify({ ...manifest, schemaVersion: 999 })) })
    await expect(importBackup(new Blob([tooNew as BlobPart]))).rejects.toMatchObject({ reason: 'too-new' })

    const tampered = zipSync({ ...files, 'data.json': strToU8(new TextDecoder().decode(files['data.json']).replace('周末', '改动')) })
    await expect(importBackup(new Blob([tampered as BlobPart]))).rejects.toBeInstanceOf(BackupError)
    await expect(importBackup(new Blob([tampered as BlobPart]))).rejects.toMatchObject({ reason: 'damaged' })

    const broken = zipSync({ ...files, 'data.json': strToU8('{ nope'), 'manifest.json': strToU8(JSON.stringify({ ...manifest, files: {} })) })
    await expect(importBackup(new Blob([broken as BlobPart]))).rejects.toMatchObject({ reason: 'damaged' })

    expect(await getDB().conversations.count()).toBe(0)
    expect(await getDB().messages.count()).toBe(0)
  })
})
