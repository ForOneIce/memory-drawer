import { rawFromMemory } from '../core/source'

/** 一份小而全的 DeepSeek 导出样本(合成数据) */
export function syntheticExport(opts: { withUserJson?: boolean } = {}) {
  const session1 = {
    id: 'aaaa-1111',
    title: '周末去哪儿 <script>alert(1)</script>',
    pinned: false,
    current_message_id: '4',
    inserted_at: '2026-03-01T01:58:55.005Z',
    updated_at: '2026-03-01T02:02:31.654Z',
    messages: [
      {
        id: '1',
        parent_id: null,
        role: 'USER',
        status: 'FINISHED',
        inserted_at: '2026-03-01T01:58:55.837Z',
        fragments: [
          { type: 'REQUEST', content: '周末想出去走走 <img src=x onerror=alert(1)>' },
          {
            type: 'FILE',
            files: [
              {
                id: 'f1',
                file_name: '小猫.png',
                file_size: 68,
                is_image: true,
                width: 1,
                height: 1,
                export_path: 'chat_sessions/aaaa-1111_files/f1_小猫.png',
              },
              {
                id: 'f2',
                file_name: '不见了.png',
                file_size: 10,
                is_image: true,
                export_path: 'chat_sessions/aaaa-1111_files/f2_不见了.png',
              },
            ],
          },
        ],
      },
      {
        id: '2',
        parent_id: '1',
        role: 'ASSISTANT',
        status: 'FINISHED',
        inserted_at: '2026-03-01T01:59:10.000Z',
        fragments: [
          { type: 'THINK', content: '先想想有什么推荐', elapsed_secs: 3.2 },
          {
            type: 'TOOL_SEARCH',
            queries: ['周末 郊游'],
            results: [{ url: 'https://example.com/a', title: '郊游指南', snippet: '去公园吧', site_name: '示例' }],
          },
          { type: 'TOOL_OPEN', status: 'FINISHED', url: 'https://example.com/b', title: '公园', snippet: 's', site_name: 'B' },
          { type: 'RESPONSE', content: '可以去**公园**散步。\n\n```js\nconsole.log("<b>hi</b>")\n```' },
          { type: 'CONTENT_RISK', content: 'AI generated', style: 'WARNING' },
        ],
      },
      {
        id: '3',
        parent_id: '1',
        role: 'ASSISTANT',
        status: 'FINISHED',
        inserted_at: '2026-03-01T02:00:00.000Z',
        fragments: [{ type: 'RESPONSE', content: '也可以去咖啡馆。' }],
      },
      {
        id: '4',
        parent_id: '3',
        role: 'USER',
        status: 'FINISHED',
        inserted_at: '2026-03-01T02:01:00.000Z',
        fragments: [{ type: 'REQUEST', content: '谢谢,我想想' }],
      },
    ],
  }
  const session2 = {
    id: 'bbbb-2222',
    title: '服务器那天',
    current_message_id: '2',
    inserted_at: '2026-04-02T10:00:00.000Z',
    updated_at: '2026-04-02T10:00:30.000Z',
    messages: [
      {
        id: '1',
        parent_id: null,
        role: 'USER',
        status: 'FINISHED',
        inserted_at: '2026-04-02T10:00:00.000Z',
        fragments: [
          { type: 'REQUEST', content: '在吗' },
          { type: 'FILE', files: [{ id: 'f9', file_name: '表格.xlsx', file_size: 1234, is_image: false, export_path: null }] },
        ],
      },
      {
        id: '2',
        parent_id: '1',
        role: 'ASSISTANT',
        status: 'TIMEOUT',
        inserted_at: '2026-04-02T10:00:30.000Z',
        fragments: [{ type: 'TEMPLATE_RESPONSE', content: '服务器繁忙，请稍后再试。' }],
      },
    ],
  }
  const session3 = {
    id: 'cccc-3333',
    title: '没见过的片段',
    current_message_id: '2',
    inserted_at: '2026-05-02T10:00:00.000Z',
    updated_at: '2026-05-02T10:00:30.000Z',
    messages: [
      { id: '1', parent_id: null, role: 'USER', status: 'FINISHED', inserted_at: '2026-05-02T10:00:00.000Z', fragments: [{ type: 'REQUEST', content: '你好' }] },
      {
        id: '2',
        parent_id: '1',
        role: 'ASSISTANT',
        status: 'INCOMPLETE',
        inserted_at: '2026-05-02T10:00:30.000Z',
        fragments: [{ type: 'FUTURE_THING', payload: { a: 1 } }, { type: 'RESPONSE', content: '半句话' }],
      },
    ],
  }
  // 1x1 PNG
  const png = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
    (c) => c.charCodeAt(0),
  )
  const entries: Record<string, string | Uint8Array> = {
    'manifest.json': JSON.stringify({ export_format_version: 3 }),
    'chat_session_index.json': JSON.stringify([{ id: 'aaaa-1111' }]),
    'chat_sessions/aaaa-1111.json': JSON.stringify(session1),
    'chat_sessions/bbbb-2222.json': JSON.stringify(session2),
    'chat_sessions/cccc-3333.json': JSON.stringify(session3),
    'chat_sessions/aaaa-1111_files/f1_小猫.png': png,
  }
  if (opts.withUserJson !== false) {
    entries['user.json'] = JSON.stringify({ email: 'secret@example.com', mobile: { mobile_number: '189******76' } })
  }
  return rawFromMemory(entries)
}
