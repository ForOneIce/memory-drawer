import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { T } from '../../core/copy'
import { getDB } from '../../core/db'
import { formatDateShort, plainPreview } from '../../core/format'
import { hideConversation, restoreConversation } from '../../core/library'
import type { ConversationRecord } from '../../core/model'
import { getAdapter } from '../../platforms'
import { go, href, useConfirm, useToast } from '../router'
import { Screen } from '../Shell'
import { Glyph, Tape } from '../stickers'

function monthKey(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

export function Library({ platformId }: { platformId: string }) {
  const adapter = getAdapter(platformId)
  const toast = useToast()
  const confirm = useConfirm()
  const [agent, setAgent] = useState<string>('')
  const list = useLiveQuery(
    () =>
      getDB()
        .conversations.where('platformId')
        .equals(platformId)
        .filter((c) => !c.hiddenAt)
        .toArray(),
    [platformId],
  )

  const agentsInData = useMemo(() => {
    const ids = new Set((list ?? []).map((c) => c.agentId))
    return (adapter?.agents ?? []).filter((a) => ids.has(a.id))
  }, [list, adapter])

  const groups = useMemo(() => {
    const shown = (list ?? [])
      .filter((c) => !agent || c.agentId === agent)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    const out: Array<{ key: string; items: ConversationRecord[] }> = []
    for (const c of shown) {
      const k = monthKey(c.updatedAt)
      const last = out[out.length - 1]
      if (last && last.key === k) last.items.push(c)
      else out.push({ key: k, items: [c] })
    }
    return out
  }, [list, agent])

  if (!adapter) {
    return (
      <Screen title={T.platform.listTitle} backTo="#/">
        <p className="empty">{T.platform.emptyTitle}</p>
      </Screen>
    )
  }

  const hide = async (c: ConversationRecord) => {
    const ok = await confirm({
      title: T.confirm.hideConvTitle,
      body: T.confirm.hideConvBody,
      confirmLabel: T.confirm.hideConvOk,
      cancelLabel: T.confirm.hideConvCancel,
    })
    if (!ok) return
    await hideConversation(c.key)
    toast(T.platform.hiddenToast, () => void restoreConversation(c.key))
  }

  const empty = list && list.length === 0

  return (
    <Screen
      title={adapter.platform.name}
      subtitle={list ? T.platform.count(list.length) : undefined}
      backTo="#/"
      right={
        <>
          <button
            type="button"
            className="icon-btn"
            aria-label={T.common.search}
            onClick={() => go(href(['search'], { platform: platformId }))}
          >
            <Glyph name="search" />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={T.platform.importAgain}
            onClick={() => go(href(['p', platformId, 'import']))}
          >
            <Glyph name="plus" />
          </button>
        </>
      }
    >
      {list === undefined ? (
        <p className="empty">{T.common.loading}</p>
      ) : empty ? (
        <div className="center-box">
          <img className="empty-art" src={`./${adapter.icon}`} alt="" width={96} height={96} />
          <h2>{T.platform.emptyTitle}</h2>
          <p>{T.platform.emptyBody}</p>
          <button type="button" className="btn" onClick={() => go(href(['p', platformId, 'import']))}>
            {T.platform.importFirst}
          </button>
        </div>
      ) : (
        <>
          {agentsInData.length > 1 ? (
            <div className="chips" role="group" aria-label={T.search.object}>
              <button type="button" className={`chip ${agent === '' ? 'on' : ''}`} onClick={() => setAgent('')}>
                {T.common.all}
              </button>
              {agentsInData.map((a) => (
                <button key={a.id} type="button" className={`chip ${agent === a.id ? 'on' : ''}`} onClick={() => setAgent(a.id)}>
                  {a.name}
                </button>
              ))}
            </div>
          ) : null}
          <p className="hint small">{T.platform.sortHint}</p>
          {groups.map((g) => (
            <section key={g.key} className="month">
              <h2 className="month-title">{g.key}</h2>
              <ul className="conv-list">
                {g.items.map((c) => (
                  <li key={c.key} className="conv-card">
                    <Tape className="tape-corner" />
                    <a className="conv-link" href={href(['c', c.key])}>
                      <span className="conv-title">{c.title || T.platform.untitled}</span>
                      <span className="conv-preview">{plainPreview(c.preview)}</span>
                      <span className="conv-meta">
                        {formatDateShort(c.updatedAt)} · {T.platform.messages(c.messageCount)}
                      </span>
                    </a>
                    <button type="button" className="mini-btn" onClick={() => hide(c)}>
                      {T.common.hide}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </Screen>
  )
}
