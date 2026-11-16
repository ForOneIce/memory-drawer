import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { T } from '../../core/copy'
import { getDB } from '../../core/db'
import { addDiary } from '../../core/diary'
import { formatBytes } from '../../core/format'
import type { Block, MessageRecord } from '../../core/model'
import { splitTerms } from '../../core/search'
import { branchPoints, latestLeaf, resolveThread } from '../../core/thread'
import { getAdapter } from '../../platforms'
import { DayPages, FileChip, Polaroid, type SlipOptions } from '../chat/ChatBlocks'
import { href, useToast } from '../router'
import { Screen } from '../Shell'
import { Glyph } from '../stickers'

type AttachmentBlock = Extract<Block, { type: 'attachment' }>

function AppAttachment({ block }: { block: AttachmentBlock }) {
  const [state, setState] = useState<{ src?: string; full?: Blob; gone?: boolean }>({})
  useEffect(() => {
    let url: string | undefined
    let alive = true
    if (!block.assetKey || !block.isImage) return
    getDB()
      .assets.get(block.assetKey)
      .then((a) => {
        if (!alive) return
        if (!a) return setState({ gone: true })
        url = URL.createObjectURL(a.thumb ?? a.blob)
        setState({ src: url, full: a.blob })
      })
      .catch(() => alive && setState({ gone: true }))
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [block.assetKey, block.isImage])

  if (!block.isImage) return <FileChip name={block.fileName} size={block.size ? formatBytes(block.size) : undefined} />
  if (block.missing || !block.assetKey || state.gone) return <Polaroid name={block.fileName} missing />
  if (!state.src) return <Polaroid name={block.fileName} missing missingText={T.reader.imageLoading} />
  return (
    <Polaroid
      name={block.fileName}
      src={state.src}
      onOpen={() => {
        if (!state.full) return
        const u = URL.createObjectURL(state.full)
        window.open(u, '_blank', 'noopener')
        window.setTimeout(() => URL.revokeObjectURL(u), 120_000)
      }}
    />
  )
}

const slipOptions: SlipOptions = {
  interactive: true,
  showThinking: true,
  showReferences: true,
  renderAttachment: (b, key) => <AppAttachment key={key} block={b} />,
}

export function Reader({ convKey, focusId }: { convKey: string; focusId?: string }) {
  const toast = useToast()
  const rec = useLiveQuery(() => getDB().conversations.get(convKey), [convKey])
  const messages = useLiveQuery(
    () => getDB().messages.where('[convKey+seq]').between([convKey, -Infinity], [convKey, Infinity]).toArray(),
    [convKey],
  ) as MessageRecord[] | undefined

  const [leaf, setLeaf] = useState<string | null | undefined>(undefined)
  const [highlight, setHighlight] = useState<string | null>(focusId ?? null)
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [findIdx, setFindIdx] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const focusDone = useRef(false)

  // 初始主线:来自搜索结果时,保证被点中的那条消息在页面上
  useEffect(() => {
    if (!rec || !messages || leaf !== undefined) return
    if (focusId) {
      const thread = resolveThread(messages, rec.currentMessageId)
      if (!thread.some((m) => m.id === focusId) && messages.some((m) => m.id === focusId)) {
        setLeaf(latestLeaf(messages, focusId))
        return
      }
    }
    setLeaf(rec.currentMessageId)
  }, [rec, messages, leaf, focusId])

  const thread = useMemo(() => (messages ? resolveThread(messages, leaf ?? null) : []), [messages, leaf])
  const branches = useMemo(() => (messages ? branchPoints(messages, thread) : undefined), [messages, thread])
  const adapter = rec ? getAdapter(rec.platformId) : undefined

  const jumpTo = useCallback((id: string) => {
    setHighlight(id)
    window.requestAnimationFrame(() => {
      document.getElementById(`m-${id}`)?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    })
  }, [])

  useEffect(() => {
    if (focusId && thread.length && !focusDone.current) {
      focusDone.current = true
      window.setTimeout(() => jumpTo(focusId), 80)
    }
  }, [focusId, thread, jumpTo])

  // 在这段回忆里找
  const terms = useMemo(() => splitTerms(findText), [findText])
  const matches = useMemo(() => {
    if (terms.length === 0) return [] as string[]
    return thread
      .filter((m) => {
        const t = m.blocks
          .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .toLowerCase()
        return terms.every((x) => t.includes(x))
      })
      .map((m) => m.id)
  }, [thread, terms])

  useEffect(() => {
    setFindIdx(0)
    if (matches.length) jumpTo(matches[0])
  }, [matches, jumpTo])

  const step = (d: number) => {
    if (!matches.length) return
    const next = (findIdx + d + matches.length) % matches.length
    setFindIdx(next)
    jumpTo(matches[next])
  }

  if (rec === undefined || messages === undefined) {
    return (
      <Screen title="" backTo="#/">
        <p className="empty">{T.common.loading}</p>
      </Screen>
    )
  }
  if (!rec || !adapter) {
    return (
      <Screen title={T.platform.listTitle} backTo="#/">
        <p className="empty">{T.reader.emptyThread}</p>
      </Screen>
    )
  }

  return (
    <Screen
      title={rec.title || T.platform.untitled}
      subtitle={adapter.platform.name}
      backTo={href(['p', rec.platformId])}
      contentRef={scroller}
      right={
        <button type="button" className="icon-btn" aria-label={T.reader.searchInChat} onClick={() => setFindOpen((v) => !v)}>
          <Glyph name="search" />
        </button>
      }
      footer={<DiaryBar rec={rec} onSaved={() => toast(T.reader.diarySaved)} />}
    >
      {findOpen ? (
        <div className="findbar">
          <input
            className="input"
            type="search"
            autoFocus
            value={findText}
            placeholder={T.reader.searchInChat}
            onChange={(e) => setFindText(e.target.value)}
          />
          <span className="find-count">{terms.length ? (matches.length ? `${findIdx + 1}/${matches.length}` : T.platform.emptySearch) : ''}</span>
          <button type="button" className="mini-btn" onClick={() => step(-1)} disabled={!matches.length}>
            {T.reader.prev}
          </button>
          <button type="button" className="mini-btn" onClick={() => step(1)} disabled={!matches.length}>
            {T.reader.nextOne}
          </button>
        </div>
      ) : null}
      <DayPages
        thread={thread}
        platformId={rec.platformId}
        options={slipOptions}
        highlightId={highlight}
        branches={branches}
        onSwitchBranch={(id) => {
          if (!messages) return
          setLeaf(latestLeaf(messages, id))
          setHighlight(null)
        }}
      />
      <div className="reader-end" />
    </Screen>
  )
}

function DiaryBar({ rec, onSaved }: { rec: { key: string; platformId: string; agentId: string }; onSaved: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)

  const grow = () => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
    el.style.overflowY = el.scrollHeight > 140 ? 'auto' : 'hidden'
  }
  useEffect(grow, [text])

  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      await addDiary({ content: text, platformId: rec.platformId, agentId: rec.agentId, conversationKey: rec.key })
      setText('')
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="diary-bar">
      <p className="hint small">{T.reader.diaryHint}</p>
      <div className="diary-row">
        <textarea
          ref={ta}
          className="input"
          rows={1}
          value={text}
          placeholder={T.reader.diaryPlaceholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void send()
          }}
        />
        <button type="button" className="btn send" disabled={!text.trim() || busy} onClick={() => void send()} aria-label={T.reader.diarySend}>
          <Glyph name="send" />
        </button>
      </div>
    </div>
  )
}
