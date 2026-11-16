import { describe, expect, it } from 'vitest'
import { T } from './copy'
import { safeFilename } from './format'
import type { Message } from './model'
import { THEMES, contrast } from './themes'
import { branchPoints, latestLeaf, resolveThread, siblingsOf } from './thread'
import { makeSnippet, splitTerms } from './search'
import { normalizePaths } from './source'

const msg = (id: string, parentId: string | null, t = 0): Message => ({
  id,
  parentId,
  role: Number(id) % 2 ? 'user' : 'assistant',
  createdAt: t,
  status: 'ok',
  blocks: [],
})

describe('分支回溯', () => {
  // 1 -> 2 -> 4
  //   \-> 3
  const msgs = [msg('1', null), msg('2', '1'), msg('3', '1'), msg('4', '2')]

  it('按 current_message_id 回溯主线', () => {
    expect(resolveThread(msgs, '4').map((m) => m.id)).toEqual(['1', '2', '4'])
    expect(resolveThread(msgs, '3').map((m) => m.id)).toEqual(['1', '3'])
  })
  it('找不到 leaf 时退回最后一条', () => {
    expect(resolveThread(msgs, 'nope').map((m) => m.id)).toEqual(['1', '2', '4'])
    expect(resolveThread([], null)).toEqual([])
  })
  it('没有父子关系时保持原顺序', () => {
    const flat = [msg('1', null), msg('2', null), msg('3', null)]
    expect(resolveThread(flat, '3').map((m) => m.id)).toEqual(['1', '2', '3'])
  })
  it('能识别分支点并切换', () => {
    const thread = resolveThread(msgs, '4')
    const bp = branchPoints(msgs, thread)
    expect([...bp.keys()]).toEqual(['2'])
    expect(bp.get('2')).toMatchObject({ index: 0, total: 2 })
    expect(siblingsOf(msgs, msgs[1]).map((m) => m.id)).toEqual(['2', '3'])
    expect(latestLeaf(msgs, '3')).toBe('3')
    expect(latestLeaf(msgs, '2')).toBe('4')
  })
  it('数据有环时不会死循环', () => {
    const loop = [msg('1', '2'), msg('2', '1')]
    expect(resolveThread(loop, '1').length).toBeLessThanOrEqual(2)
  })
})

describe('情绪色彩', () => {
  it('5 套主题,名称和需求一致', () => {
    expect(THEMES.map((t) => t.name)).toEqual(['宁静', '轻松', '想念', '快乐', '夜深'])
  })
  for (const t of THEMES) {
    describe(t.name, () => {
      const k = t.tokens
      it('正文文字对比度 ≥ 4.5 (WCAG AA)', () => {
        expect(contrast(k.ink, k.paper)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(k.ink, k.card)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(k.ink, k.userSlip)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(k.ink, k.asstSlip)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(k.inkSoft, k.paper)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(k.inkSoft, k.card)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(k.inkSoft, k.userSlip)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(k.inkSoft, k.asstSlip)).toBeGreaterThanOrEqual(4.5)
      })
      it('主色按钮上的文字清晰', () => {
        expect(contrast(k.onPrimary, k.primary)).toBeGreaterThanOrEqual(4.5)
      })
      it('链接/强调文字放在纸、便签、柔和按钮上都清晰', () => {
        // 快乐主题的主色是亮黄色,只用于按钮底色,文字改用深琥珀色 link
        for (const bg of [k.paper, k.card, k.userSlip, k.asstSlip, k.secondary]) {
          expect(contrast(k.link, bg)).toBeGreaterThanOrEqual(4.5)
        }
      })
      it('柔和按钮(secondary 底)上的正文清晰', () => {
        expect(contrast(k.ink, k.secondary)).toBeGreaterThanOrEqual(4.5)
      })
      it('桌面图标文字标签在标签底色上清晰', () => {
        expect(contrast(k.ink, k.card)).toBeGreaterThanOrEqual(4.5)
      })
    })
  }
})

describe('文案规范', () => {
  const banned = ['删除', '清空', '失败', '错误', '丢失', '告别', '结束', '超时', '未读', '逾期', '警告', '崩溃', '死', '永久']
  const strings: string[] = []
  const walk = (o: unknown, path: string) => {
    if (typeof o === 'string') strings.push(`${path}=${o}`)
    else if (typeof o === 'function') {
      try {
        const out = (o as (...a: unknown[]) => unknown)(1, 2, 3, true, 'x')
        if (typeof out === 'string') strings.push(`${path}()=${out}`)
      } catch {
        /* 带参数的文案函数,忽略 */
      }
    } else if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}[${i}]`))
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`)
  }
  walk(T, 'T')
  it('收集到足够多的文案', () => expect(strings.length).toBeGreaterThan(150))
  it('不包含容易触发负面情绪的词', () => {
    const hits = strings.filter((s) => banned.some((w) => s.includes(w)))
    expect(hits).toEqual([])
  })
  it('不出现性别化称呼', () => {
    const words = ['小仙女', '姐妹', '宝宝', '亲爱的', '女神', '美女', '小姐姐']
    expect(strings.filter((s) => words.some((w) => s.includes(w)))).toEqual([])
  })
})

describe('文件名', () => {
  it('清理非法字符', () => {
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j')
  })
  it('处理空值、保留名、过长和结尾的点', () => {
    expect(safeFilename('')).toBe('回忆')
    expect(safeFilename('   ')).toBe('回忆')
    expect(safeFilename('CON')).toBe('_CON')
    expect(safeFilename('abc...')).toBe('abc')
    expect(Array.from(safeFilename('字'.repeat(300))).length).toBeLessThanOrEqual(80)
  })
  it('保留 emoji 与中文', () => {
    expect(safeFilename('周末🌸计划')).toBe('周末🌸计划')
  })
})

describe('搜索片段', () => {
  it('多个关键词按空格拆分', () => {
    expect(splitTerms('  春节  上班 ')).toEqual(['春节', '上班'])
  })
  it('生成带高亮区间的片段', () => {
    const { snippet, marks } = makeSnippet('过完新年春节长假后,回到工作岗位上班', ['春节'])
    expect(marks.length).toBe(1)
    expect(snippet.slice(marks[0][0], marks[0][1])).toBe('春节')
  })
})

describe('导出包根目录识别', () => {
  it('去掉最外层文件夹', () => {
    const { map } = normalizePaths(['deepseek_data/manifest.json', 'deepseek_data/chat_sessions/a.json', 'deepseek_data/'], [
      'manifest.json',
      'chat_sessions/',
    ])
    expect([...map.keys()].sort()).toEqual(['chat_sessions/a.json', 'manifest.json'])
  })
  it('没有外层文件夹也可以', () => {
    const { map } = normalizePaths(['manifest.json', 'chat_sessions/a.json'], ['manifest.json', 'chat_sessions/'])
    expect([...map.keys()].sort()).toEqual(['chat_sessions/a.json', 'manifest.json'])
  })
  it('Windows 路径分隔符', () => {
    const { map } = normalizePaths(['x\\chat_sessions\\a.json'], ['chat_sessions/'])
    expect([...map.keys()]).toEqual(['chat_sessions/a.json'])
  })
})
