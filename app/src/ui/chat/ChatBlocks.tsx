import { useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { T } from '../../core/copy'
import { dayKey, formatDayLong, formatTime } from '../../core/format'
import type { Block, Message, ReferenceItem } from '../../core/model'
import type { BranchPoint } from '../../core/thread'
import { PlatformSticker } from '../platformArt'
import { SparkleSticker, Stamp, Tape } from '../stickers'

type AttachmentBlock = Extract<Block, { type: 'attachment' }>

/** 从 id 生成稳定的小角度,让便签看起来是随手贴上去的 */
function tilt(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ((Math.abs(h) % 9) - 4) * 0.12
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href && /^https?:\/\//i.test(href) ? (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          // 不加载 Markdown 里的外部图片,保证不向任何网站发出请求
          img: ({ alt }) => <span className="md-img">[{alt || '图片'}]</span>,
          table: ({ children }) => (
            <div className="md-table">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

export function FileChip({ name, size }: { name: string; size?: string }) {
  return (
    <p className="file-chip">
      <span>{T.reader.file}</span>
      {name}
      {size ? <em>{size}</em> : null}
    </p>
  )
}

export function Polaroid({
  src,
  onOpen,
  name,
  missing,
  caption,
  missingText,
}: {
  src?: string
  /** 点击看大图(应用内使用;导出的网页里没有) */
  onOpen?: () => void
  name: string
  missing?: boolean
  caption?: string
  /** 没有图片时显示的说明,默认是"没能随导出一起保存" */
  missingText?: string
}) {
  return (
    <figure className="polaroid">
      <Tape className="tape-top" />
      {src && !missing ? (
        onOpen ? (
          <button type="button" className="img-btn" onClick={onOpen} aria-label={`${T.reader.imageOpen}:${name}`}>
            <img src={src} alt={name} loading="lazy" />
          </button>
        ) : (
          <img src={src} alt={name} loading="lazy" />
        )
      ) : (
        <div className="polaroid-missing">{missingText ?? T.reader.attachmentMissing}</div>
      )}
      <figcaption>{caption ?? name}</figcaption>
    </figure>
  )
}

function References({ items, queries }: { items: ReferenceItem[]; queries?: string[] }) {
  return (
    <details className="note-details">
      <summary>{items.length ? T.reader.referencesCount(items.length) : T.reader.references}</summary>
      {queries && queries.length > 0 ? (
        <p className="queries">
          <strong>{T.reader.queries}:</strong> {queries.join(' / ')}
        </p>
      ) : null}
      {items.length > 0 ? <p className="link-note">{T.reader.linkNote}</p> : null}
      <ul className="refs">
        {items.map((r) => (
          <li key={r.url}>
            <a href={r.url} target="_blank" rel="noopener noreferrer nofollow">
              {r.title}
            </a>
            <span className="ref-site">{[r.site, r.publishedAt?.slice(0, 10)].filter(Boolean).join(' · ')}</span>
            {r.snippet ? <span className="ref-snippet">{r.snippet}</span> : null}
          </li>
        ))}
      </ul>
    </details>
  )
}

function Clamp({ children, long }: { children: ReactNode; long: boolean }) {
  const [open, setOpen] = useState(false)
  if (!long) return <>{children}</>
  return (
    <div className={`clamp ${open ? 'open' : ''}`}>
      <div className="clamp-body">{children}</div>
      <button type="button" className="link-btn" onClick={() => setOpen((v) => !v)}>
        {open ? T.reader.showLess : T.reader.showMore}
      </button>
    </div>
  )
}

export interface SlipOptions {
  /** false 时(导出的静态网页)不使用任何需要脚本的交互 */
  interactive: boolean
  showThinking: boolean
  showReferences: boolean
  renderAttachment: (b: AttachmentBlock, key: string) => ReactNode
}

export function MessageSlip({
  message,
  platformId,
  options,
  highlight,
  branch,
  onSwitchBranch,
}: {
  message: Message
  platformId: string
  options: SlipOptions
  highlight?: boolean
  branch?: BranchPoint
  onSwitchBranch?: (messageId: string) => void
}) {
  const mine = message.role === 'user'
  const longText = message.blocks.some((b) => b.type === 'text' && b.text.length > 1800)
  const body = (
    <>
      {message.blocks.map((b, i) => {
        const key = `${message.id}-${i}`
        switch (b.type) {
          case 'text':
            return mine ? (
              <p key={key} className="plain">
                {b.text}
              </p>
            ) : (
              <Markdown key={key} text={b.text} />
            )
          case 'thinking':
            return options.showThinking ? (
              <details key={key} className="note-details">
                <summary>{T.reader.thinking(b.seconds)}</summary>
                <p className="plain soft">{b.text}</p>
              </details>
            ) : null
          case 'references':
            return options.showReferences ? <References key={key} items={b.items} queries={b.queries} /> : null
          case 'attachment':
            return options.renderAttachment(b, key)
          case 'notice':
            return (
              <p key={key} className="notice">
                <SparkleSticker size={14} /> {T.reader.notice[b.kind]}
              </p>
            )
          case 'unknown':
            return (
              <p key={key} className="notice">
                {T.reader.unknown(b.rawType)}
              </p>
            )
        }
      })}
    </>
  )

  return (
    <article
      id={`m-${message.id}`}
      className={`slip ${mine ? 'slip-me' : 'slip-them'} ${highlight ? 'slip-hit' : ''}`}
      style={{ transform: `rotate(${tilt(message.id)}deg)` }}
      data-role={message.role}
    >
      {!mine ? <Tape className="tape-corner" /> : null}
      <header className="slip-head">
        {mine ? (
          <span className="who">{T.reader.me}</span>
        ) : (
          <span className="who">
            <PlatformSticker platformId={platformId} size={34} />
          </span>
        )}
        <time>{formatTime(message.createdAt)}</time>
      </header>
      <div className="slip-body">{options.interactive ? <Clamp long={longText}>{body}</Clamp> : body}</div>
      {branch && branch.total > 1 ? (
        <footer className="branch">
          <span className="branch-hint">{T.reader.branchHint}</span>
          {options.interactive && onSwitchBranch ? (
            <span className="branch-ctl">
              <button
                type="button"
                className="mini-btn"
                disabled={branch.index <= 0}
                onClick={() => onSwitchBranch(branch.siblings[branch.index - 1])}
              >
                {T.reader.prev}
              </button>
              <span>{T.reader.branchLabel(branch.index + 1, branch.total)}</span>
              <button
                type="button"
                className="mini-btn"
                disabled={branch.index >= branch.total - 1}
                onClick={() => onSwitchBranch(branch.siblings[branch.index + 1])}
              >
                {T.reader.nextOne}
              </button>
            </span>
          ) : (
            <span>{T.reader.branchLabel(branch.index + 1, branch.total)}</span>
          )}
        </footer>
      ) : null}
    </article>
  )
}

export function groupByDay(thread: Message[]): Array<{ key: string; ts: number; messages: Message[] }> {
  const pages: Array<{ key: string; ts: number; messages: Message[] }> = []
  for (const m of thread) {
    const k = dayKey(m.createdAt)
    const last = pages[pages.length - 1]
    if (last && last.key === k) last.messages.push(m)
    else pages.push({ key: k, ts: m.createdAt, messages: [m] })
  }
  return pages
}

/** 按日成页的手账。同一天的对话是一页 */
export function DayPages({
  thread,
  platformId,
  options,
  highlightId,
  branches,
  onSwitchBranch,
}: {
  thread: Message[]
  platformId: string
  options: SlipOptions
  highlightId?: string | null
  branches?: Map<string, BranchPoint>
  onSwitchBranch?: (messageId: string) => void
}) {
  if (thread.length === 0) return <p className="empty">{T.reader.emptyThread}</p>
  return (
    <>
      {groupByDay(thread).map((p) => (
        <section className="page" key={p.key}>
          <header className="page-head">
            <Stamp>{formatDayLong(p.ts)}</Stamp>
          </header>
          {p.messages.map((m) => (
            <MessageSlip
              key={m.id}
              message={m}
              platformId={platformId}
              options={options}
              highlight={highlightId === m.id}
              branch={branches?.get(m.id)}
              onSwitchBranch={onSwitchBranch}
            />
          ))}
        </section>
      ))}
    </>
  )
}
