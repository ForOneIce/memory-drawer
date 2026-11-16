import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { T } from '../../core/copy'
import { getDB } from '../../core/db'
import { formatDateTime, parseDateInput, toDateInput } from '../../core/format'
import type { Role } from '../../core/model'
import { searchMessages, type SearchHit } from '../../core/search'
import { adapters, agentName } from '../../platforms'
import { href } from '../router'
import { Screen } from '../Shell'
import { Glyph } from '../stickers'

function Highlighted({ hit }: { hit: SearchHit }) {
  const parts: Array<{ text: string; mark: boolean }> = []
  let at = 0
  // 合并重叠的区间
  const marks: Array<[number, number]> = []
  for (const m of hit.marks) {
    const last = marks[marks.length - 1]
    if (last && m[0] <= last[1]) last[1] = Math.max(last[1], m[1])
    else marks.push([m[0], m[1]])
  }
  for (const [a, b] of marks) {
    if (a > at) parts.push({ text: hit.snippet.slice(at, a), mark: false })
    parts.push({ text: hit.snippet.slice(a, b), mark: true })
    at = b
  }
  if (at < hit.snippet.length) parts.push({ text: hit.snippet.slice(at), mark: false })
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p.mark ? <mark>{p.text}</mark> : p.text}</Fragment>
      ))}
    </>
  )
}

export function SearchScreen({ platformId }: { platformId?: string }) {
  const [q, setQ] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [role, setRole] = useState<Role | 'any'>('any')
  const [agent, setAgent] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [busy, setBusy] = useState(false)

  const convs = useLiveQuery(() => getDB().conversations.toArray(), [])
  const titles = useMemo(() => new Map((convs ?? []).map((c) => [c.key, c.title])), [convs])

  const agentOptions = useMemo(() => {
    const present = new Set((convs ?? []).filter((c) => !platformId || c.platformId === platformId).map((c) => `${c.platformId}|${c.agentId}`))
    return adapters
      .flatMap((a) => a.agents.map((g) => ({ platformId: a.platform.id, id: g.id, name: g.name })))
      .filter((o) => present.has(`${o.platformId}|${o.id}`))
  }, [convs, platformId])

  const fromTs = parseDateInput(from)
  const toTs = (() => {
    const t = parseDateInput(to)
    return t === undefined ? undefined : t + 24 * 3600 * 1000
  })()
  const hasCriteria = q.trim() !== '' || fromTs !== undefined || toTs !== undefined

  useEffect(() => {
    if (!hasCriteria) {
      setHits(null)
      return
    }
    let alive = true
    setBusy(true)
    const id = window.setTimeout(async () => {
      try {
        const [pid, aid] = agent ? agent.split('|') : [platformId, undefined]
        const r = await searchMessages({ q, from: fromTs, to: toTs, role, platformId: pid, agentId: aid })
        if (alive) setHits(r)
      } finally {
        if (alive) setBusy(false)
      }
    }, 200)
    return () => {
      alive = false
      window.clearTimeout(id)
    }
  }, [q, fromTs, toTs, role, agent, platformId, hasCriteria])

  const quick = (kind: 'all' | 'month' | 'year') => {
    if (kind === 'all') {
      setFrom('')
      setTo('')
      return
    }
    const now = new Date()
    const start = new Date(now)
    if (kind === 'month') start.setMonth(start.getMonth() - 1)
    else start.setFullYear(start.getFullYear() - 1)
    setFrom(toDateInput(start.getTime()))
    setTo(toDateInput(now.getTime()))
  }

  return (
    <Screen
      title={T.search.title}
      backTo={platformId ? href(['p', platformId]) : '#/'}
      right={
        <button type="button" className={`icon-btn ${showFilters ? 'on' : ''}`} aria-label={T.search.filters} aria-pressed={showFilters} onClick={() => setShowFilters((v) => !v)}>
          <Glyph name="filter" />
        </button>
      }
    >
      <div className="searchbox">
        <Glyph name="search" size={20} />
        <input
          className="input"
          type="search"
          autoFocus
          value={q}
          placeholder={T.platform.searchPlaceholder}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <p className="hint small">{T.search.hint}</p>

      {showFilters ? (
        <div className="filters card">
          <div className="field">
            <span className="label">{T.search.timeRange}</span>
            <div className="chips">
              <button type="button" className="chip" onClick={() => quick('all')}>{T.search.quickAll}</button>
              <button type="button" className="chip" onClick={() => quick('month')}>{T.search.quickMonth}</button>
              <button type="button" className="chip" onClick={() => quick('year')}>{T.search.quickYear}</button>
            </div>
            <div className="date-row">
              <label>
                {T.search.from}
                <input className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label>
                {T.search.to}
                <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
          </div>
          <div className="field">
            <span className="label">{T.search.who}</span>
            <div className="chips" role="radiogroup">
              {(
                [
                  ['any', T.search.whoAny],
                  ['user', T.search.whoMe],
                  ['assistant', T.search.whoThem],
                ] as Array<[Role | 'any', string]>
              ).map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={role === v} className={`chip ${role === v ? 'on' : ''}`} onClick={() => setRole(v)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {agentOptions.length > 1 ? (
            <div className="field">
              <span className="label">{T.search.object}</span>
              <select className="input" value={agent} onChange={(e) => setAgent(e.target.value)}>
                <option value="">{T.common.all}</option>
                {agentOptions.map((o) => (
                  <option key={`${o.platformId}|${o.id}`} value={`${o.platformId}|${o.id}`}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      {!hasCriteria ? (
        <p className="empty">{T.search.startHint}</p>
      ) : hits === null || busy ? (
        <p className="empty">{T.common.loading}</p>
      ) : hits.length === 0 ? (
        <p className="empty">{T.platform.emptySearch}</p>
      ) : (
        <>
          <p className="hint">{hits.length >= 300 ? T.search.resultsMore(hits.length) : T.search.results(hits.length)}</p>
          <ul className="hit-list">
            {hits.map((h) => (
              <li key={`${h.convKey}/${h.messageId}`}>
                <a className="hit" href={href(['c', h.convKey], { m: h.messageId })}>
                  <span className="hit-meta">
                    {h.role === 'user' ? T.reader.me : agentName(h.platformId, h.agentId)} · {formatDateTime(h.createdAt)}
                  </span>
                  <span className="hit-snippet">
                    <Highlighted hit={h} />
                  </span>
                  <span className="hit-conv">{titles.get(h.convKey) || T.platform.untitled}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </Screen>
  )
}
