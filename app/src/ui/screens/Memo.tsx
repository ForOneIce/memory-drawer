import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { T } from '../../core/copy'
import { getDB } from '../../core/db'
import { addDiary, hideDiary, listDiaries, restoreDiary, updateDiary } from '../../core/diary'
import { dayKey, formatDayLong, formatTime } from '../../core/format'
import type { Diary } from '../../core/model'
import { adapters, agentName } from '../../platforms'
import { href, useConfirm, useToast } from '../router'
import { Screen } from '../Shell'
import { Glyph, Stamp, Tape } from '../stickers'

export function Memo() {
  const toast = useToast()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState<Diary | null>(null)
  const diaries = useLiveQuery(() => listDiaries({ query: q }), [q])
  const convs = useLiveQuery(() => getDB().conversations.toArray(), [])
  const convKeys = useMemo(() => new Set((convs ?? []).filter((c) => !c.hiddenAt).map((c) => c.key)), [convs])

  const groups = useMemo(() => {
    const out: Array<{ key: string; ts: number; items: Diary[] }> = []
    for (const d of diaries ?? []) {
      const k = dayKey(d.createdAt)
      const last = out[out.length - 1]
      if (last && last.key === k) last.items.push(d)
      else out.push({ key: k, ts: d.createdAt, items: [d] })
    }
    return out
  }, [diaries])

  const hide = async (d: Diary) => {
    const ok = await confirm({
      title: T.confirm.hideDiaryTitle,
      body: T.confirm.hideDiaryBody,
      confirmLabel: T.confirm.hideDiaryOk,
      cancelLabel: T.confirm.hideDiaryCancel,
    })
    if (!ok) return
    await hideDiary(d.id)
    toast(T.memo.hiddenToast, () => void restoreDiary(d.id))
  }

  return (
    <Screen
      title={T.memo.title}
      subtitle={T.memo.subtitle}
      backTo="#/"
      right={
        <button type="button" className="icon-btn" aria-label={T.memo.newTitle} onClick={() => setComposing(true)}>
          <Glyph name="plus" />
        </button>
      }
    >
      <div className="searchbox">
        <Glyph name="search" size={20} />
        <input className="input" type="search" value={q} placeholder={T.memo.searchPlaceholder} onChange={(e) => setQ(e.target.value)} />
      </div>

      {diaries === undefined ? (
        <p className="empty">{T.common.loading}</p>
      ) : diaries.length === 0 ? (
        <div className="center-box">
          <p>{q ? T.memo.emptySearch : T.memo.empty}</p>
          {!q ? (
            <button type="button" className="btn" onClick={() => setComposing(true)}>
              {T.memo.newTitle}
            </button>
          ) : null}
        </div>
      ) : (
        groups.map((g) => (
          <section className="page" key={g.key}>
            <header className="page-head">
              <Stamp>{formatDayLong(g.ts)}</Stamp>
            </header>
            {g.items.map((d) => (
              <article key={d.id} className="slip slip-me diary-slip">
                <Tape className="tape-corner" />
                <header className="slip-head">
                  <span className="who">{d.platformId ? T.memo.from(agentName(d.platformId, d.agentId ?? 'default')) : ''}</span>
                  <time>{formatTime(d.createdAt)}</time>
                </header>
                <div className="slip-body">
                  <p className="plain">{d.content}</p>
                </div>
                <footer className="diary-actions">
                  {d.conversationKey && convKeys.has(d.conversationKey) ? (
                    <a className="link-btn" href={href(['c', d.conversationKey])}>
                      {T.memo.inChat}
                    </a>
                  ) : (
                    <span />
                  )}
                  <span className="actions">
                    <button type="button" className="mini-btn" onClick={() => setEditing(d)}>
                      {T.memo.edit}
                    </button>
                    <button type="button" className="mini-btn" onClick={() => void hide(d)}>
                      {T.common.hide}
                    </button>
                  </span>
                </footer>
              </article>
            ))}
          </section>
        ))
      )}

      {composing ? (
        <Composer
          onClose={() => setComposing(false)}
          onSaved={() => {
            setComposing(false)
            toast(T.toast.saved)
          }}
        />
      ) : null}
      {editing ? (
        <Composer
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast(T.toast.saved)
          }}
        />
      ) : null}
    </Screen>
  )
}

function Composer({ initial, onClose, onSaved }: { initial?: Diary; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(initial?.content ?? '')
  const [target, setTarget] = useState(initial?.platformId ? `${initial.platformId}|${initial.agentId ?? 'default'}` : '')
  const [busy, setBusy] = useState(false)
  const options = adapters.flatMap((a) => a.agents.map((g) => ({ value: `${a.platform.id}|${g.id}`, name: g.name })))

  const save = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      if (initial) await updateDiary(initial.id, text)
      else {
        const [platformId, agentId] = target ? target.split('|') : [null, null]
        await addDiary({ content: text, platformId, agentId })
      }
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={T.memo.newTitle}>
      <button type="button" className="sheet-backdrop" aria-label={T.common.close} onClick={onClose} />
      <div className="sheet">
        <h2>{initial ? T.memo.edit : T.memo.newTitle}</h2>
        <textarea className="input" rows={6} autoFocus value={text} placeholder={T.memo.placeholder} onChange={(e) => setText(e.target.value)} />
        {!initial ? (
          <label className="field">
            <span className="label">{T.memo.target}</span>
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{T.memo.targetNone}</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="row">
          <button type="button" className="btn big" disabled={!text.trim() || busy} onClick={() => void save()}>
            {T.memo.save}
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            {T.common.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
