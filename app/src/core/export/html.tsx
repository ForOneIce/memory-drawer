import { renderToStaticMarkup } from 'react-dom/server'
import chatCss from '../../ui/chat/chat.css?inline'
import { DayPages, FileChip, Polaroid, groupByDay, type SlipOptions } from '../../ui/chat/ChatBlocks'
import { PlatformSticker } from '../../ui/platformArt'
import { agentName } from '../../platforms'
import { T } from '../copy'
import { getDB } from '../db'
import { formatBytes, formatDateShort, formatDayLong, formatTime, localTimezone, safeFilename, stamp } from '../format'
import { blobToDataUrl, makeExportImage } from '../image'
import type { Diary, Message, ThemeId } from '../model'
import { resolveThread } from '../thread'
import { zipBuilder } from './zip'
import { getTheme, themeVars } from '../themes'
import {
  ExportCancelled,
  attachmentsOf,
  checkAbort,
  inRange,
  loadMessages,
  planExport,
  type ExportPlan,
  type ExportSelection,
} from './collect'

export { ExportCancelled }

/** 单个网页文件的体积上限。超过就自动分成几个小文件并装进压缩包 */
export const SINGLE_FILE_LIMIT = 48 * 1024 * 1024
const INLINE_IMAGE_FALLBACK_LIMIT = 3 * 1024 * 1024

export interface HtmlExportInput {
  sel: ExportSelection
  themeId: ThemeId
  withImages: boolean
  withThinking: boolean
  /** auto:太大时自动分卷 */
  mode?: 'auto' | 'single' | 'zip'
}

export interface ExportStats {
  conversations: number
  diaries: number
  messages: number
  days: number
  images: number
}

export interface ExportOutput {
  /** 是手账风网页还是备份包 */
  format: 'html' | 'backup'
  kind: 'html' | 'zip'
  blob: Blob
  filename: string
  mime: string
  stats: ExportStats
  withImages: boolean
}

export interface ExportProgress {
  done: number
  total: number
}

export function estimateHtmlSize(plan: ExportPlan, withImages: boolean): number {
  const text = plan.textBytes * 1.8 + 40_000
  if (!withImages || plan.imageCount === 0) return text
  const perImage = Math.min(plan.imageBytes / plan.imageCount, 350 * 1024)
  return text + plan.imageCount * perImage * 1.34
}

export function willSplit(plan: ExportPlan, withImages: boolean): boolean {
  return estimateHtmlSize(plan, withImages) > SINGLE_FILE_LIMIT
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const EXPORT_CSS = `
html,body{margin:0;padding:0}
body{min-height:100vh;background:linear-gradient(160deg,var(--bg1),var(--bg2));background-attachment:fixed;-webkit-text-size-adjust:100%}
.doc{max-width:720px;margin:0 auto;padding:28px 14px 56px}
.cover{text-align:center;margin:12px 0 22px}
.cover h1{margin:6px 0 4px;font-family:var(--font-hand);font-size:28px;color:var(--ink)}
.cover p{margin:2px 0;color:var(--ink-soft);font-size:14px}
.toc{background:var(--card);border-radius:14px;padding:12px 16px;margin:18px 0;box-shadow:0 6px 18px rgba(0,0,0,.08)}
.toc h2{margin:2px 0 8px;font-size:16px;font-family:var(--font-hand);color:var(--primary)}
.toc ol{margin:0;padding-left:1.5em}
.toc li{margin:4px 0;font-size:15px}
.toc a{color:var(--ink);text-underline-offset:3px}
.toc .toc-meta{color:var(--ink-soft);font-size:12.5px;margin-left:6px}
.conv{margin:34px 0}
.conv-title{margin:0;font-family:var(--font-hand);font-size:20px;line-height:1.4;color:var(--ink);display:flex;align-items:center;gap:8px}
.conv-meta{margin:2px 0 0;color:var(--ink-soft);font-size:13px}
.year-title{font-family:var(--font-hand);font-size:22px;margin:30px 0 0;color:var(--primary)}
.foot{margin-top:40px;text-align:center;color:var(--ink-soft);font-size:13px}
.back-top{display:block;text-align:right;margin-top:6px}
.back-top a{color:var(--primary);font-size:13px}
.diary-obj{font-size:12px;color:var(--ink-soft)}
`

function docHtml(opts: { title: string; themeId: ThemeId; body: string; heading?: string; subtitle?: string }): string {
  const theme = getTheme(opts.themeId)
  const csp =
    "default-src 'none'; img-src data: file: 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
  return (
    `<!doctype html><html lang="zh-CN" data-theme="${theme.id}" data-quiet="true">` +
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<title>${escapeHtml(opts.title)}</title>` +
    `<style>:root[data-theme="${theme.id}"]{${themeVars(theme.tokens)}}${chatCss}${EXPORT_CSS}</style></head>` +
    `<body class="hy-root"><main class="doc">` +
    `<header class="cover">${renderToStaticMarkup(<PlatformSticker platformId="deepseek" size={44} />)}` +
    `<h1>${escapeHtml(opts.heading ?? opts.title)}</h1>` +
    `<p>${escapeHtml(opts.subtitle ?? '')}</p><p>${escapeHtml(T.exporter.htmlTimezone(localTimezone()))}</p></header>` +
    `${opts.body}` +
    `<p class="foot">${escapeHtml(T.exporter.htmlFooter)}</p></main></body></html>`
  )
}

// ---- 图片处理 ----

interface ImageSink {
  /** 返回在网页里使用的地址;返回 undefined 表示没能放进去 */
  resolve(assetKey: string): Promise<string | undefined>
}

async function prepareImageBlob(assetKey: string): Promise<{ blob: Blob; ext: string } | undefined> {
  const a = await getDB().assets.get(assetKey)
  if (!a) return undefined
  const small = await makeExportImage(a.blob)
  if (small) return { blob: small, ext: 'jpg' }
  if (a.size <= INLINE_IMAGE_FALLBACK_LIMIT) {
    return { blob: a.blob, ext: (a.fileName.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png' }
  }
  return undefined
}

function inlineSink(): ImageSink {
  const cache = new Map<string, string | undefined>()
  return {
    async resolve(key) {
      if (cache.has(key)) return cache.get(key)
      const prepared = await prepareImageBlob(key)
      const src = prepared ? await blobToDataUrl(prepared.blob) : undefined
      cache.set(key, src)
      return src
    },
  }
}

function fileSink(files: Map<string, Blob>): ImageSink & { count(): number } {
  const cache = new Map<string, string | undefined>()
  return {
    count: () => files.size,
    async resolve(key) {
      if (cache.has(key)) return cache.get(key)
      const prepared = await prepareImageBlob(key)
      let src: string | undefined
      if (prepared) {
        const name = `images/${files.size + 1}.${prepared.ext}`
        files.set(name, prepared.blob)
        src = name
      }
      cache.set(key, src)
      return src
    },
  }
}

function makeOptions(input: HtmlExportInput, resolved: Map<string, string | undefined>): SlipOptions {
  return {
    interactive: false,
    showThinking: input.withThinking,
    showReferences: input.withThinking,
    renderAttachment: (b, key) => {
      if (!b.isImage) return <FileChip key={key} name={b.fileName} size={b.size ? formatBytes(b.size) : undefined} />
      if (!input.withImages) {
        return (
          <Polaroid
            key={key}
            name={b.fileName}
            missing
            missingText={T.exporter.imageSkipped}
          />
        )
      }
      const src = b.assetKey ? resolved.get(b.assetKey) : undefined
      if (src) return <Polaroid key={key} name={b.fileName} src={src} />
      return (
        <Polaroid
          key={key}
          name={b.fileName}
          missing
          missingText={b.assetKey ? T.exporter.imageTooBig : undefined}
        />
      )
    },
  }
}

// ---- 渲染 ----

interface ConvDoc {
  index: number
  title: string
  platformId: string
  agentId: string
  startedAt: number
  endedAt: number
  messages: number
  thread: Message[]
}

async function loadConvDoc(
  input: HtmlExportInput,
  rec: { key: string; title: string; platformId: string; agentId: string; currentMessageId: string | null },
  index: number,
): Promise<ConvDoc | null> {
  const all = await loadMessages(rec.key)
  const thread = resolveThread(all, rec.currentMessageId).filter((m) => inRange(m.createdAt, input.sel))
  if (thread.length === 0) return null
  return {
    index,
    title: rec.title || T.platform.untitled,
    platformId: rec.platformId,
    agentId: rec.agentId,
    startedAt: thread[0].createdAt,
    endedAt: thread[thread.length - 1].createdAt,
    messages: thread.length,
    thread,
  }
}

function ConvSection({ doc, options }: { doc: ConvDoc; options: SlipOptions }) {
  return (
    <section className="conv" id={`c-${doc.index}`}>
      <h2 className="conv-title">
        <PlatformSticker platformId={doc.platformId} size={28} />
        <span>{doc.title}</span>
      </h2>
      <p className="conv-meta">
        {formatDateShort(doc.startedAt)} – {formatDateShort(doc.endedAt)} · {T.platform.messages(doc.messages)}
      </p>
      <DayPages thread={doc.thread} platformId={doc.platformId} options={options} />
      <span className="back-top">
        <a href="#top">↑</a>
      </span>
    </section>
  )
}

function DiaryPages({ diaries }: { diaries: Diary[] }) {
  const groups = groupByDay(diaries.map((d) => ({ id: d.id, createdAt: d.createdAt }) as Message))
  const byId = new Map(diaries.map((d) => [d.id, d]))
  return (
    <section className="conv" id="diary">
      <h2 className="conv-title">{T.exporter.htmlDiaryTitle}</h2>
      {groups.map((g) => (
        <section className="page" key={g.key}>
          <header className="page-head">
            <span className="stamp">{formatDayLong(g.ts)}</span>
          </header>
          {g.messages.map((m) => {
            const d = byId.get(m.id)!
            const obj = d.platformId ? agentName(d.platformId, d.agentId ?? 'default') : ''
            return (
              <article className="slip slip-me" key={d.id}>
                <header className="slip-head">
                  <span className="who diary-obj">{obj ? T.memo.from(obj) : ''}</span>
                  <time>{formatTime(d.createdAt)}</time>
                </header>
                <div className="slip-body">
                  <p className="plain">{d.content}</p>
                </div>
              </article>
            )
          })}
        </section>
      ))}
    </section>
  )
}

function Toc({ docs, hrefBase, hasDiary }: { docs: Array<ConvDoc & { href?: string }>; hrefBase?: string; hasDiary: boolean }) {
  return (
    <nav className="toc" id="top">
      <h2>{T.exporter.htmlToc}</h2>
      <ol>
        {docs.map((d) => (
          <li key={d.index}>
            <a href={`${d.href ?? hrefBase ?? ''}#c-${d.index}`}>{d.title}</a>
            <span className="toc-meta">
              {formatDateShort(d.startedAt)} · {T.platform.messages(d.messages)}
            </span>
          </li>
        ))}
        {hasDiary ? (
          <li>
            <a href={`${hrefBase ?? ''}#diary`}>{T.exporter.htmlDiaryTitle}</a>
          </li>
        ) : null}
      </ol>
    </nav>
  )
}

/**
 * 生成手账风网页。
 * 内容少时是一个 .html 文件(图片内嵌);内容多时自动分卷为 .zip(网页 + images 文件夹)。
 * 所有用户内容都经过转义,导出的网页不含脚本、不请求任何网络资源。
 */
export async function buildHtmlExport(
  input: HtmlExportInput,
  onProgress?: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportOutput> {
  const plan = await planExport(input.sel)
  if (plan.empty) throw new Error('empty')
  const split = input.mode === 'zip' || (input.mode !== 'single' && willSplit(plan, input.withImages))

  const total = plan.conversations.length + 1
  let done = 0
  const tick = async () => {
    done++
    onProgress?.({ done, total })
    await new Promise((r) => setTimeout(r, 0))
    checkAbort(signal)
  }

  const imageFiles = new Map<string, Blob>()
  const sink: ImageSink = split ? fileSink(imageFiles) : inlineSink()
  const resolved = new Map<string, string | undefined>()
  const options = makeOptions(input, resolved)

  const docs: ConvDoc[] = []
  let imagesUsed = 0
  const bodies: string[] = []
  const years: Array<{ year: number; docs: ConvDoc[]; bodies: string[] }> = []
  let messageTotal = 0

  let idx = 0
  for (const rec of plan.conversations) {
    checkAbort(signal)
    const doc = await loadConvDoc(input, rec, idx + 1)
    if (!doc) {
      await tick()
      continue
    }
    idx++
    doc.index = idx
    if (input.withImages) {
      for (const b of attachmentsOf(doc.thread)) {
        if (b.assetKey && !resolved.has(b.assetKey)) {
          resolved.set(b.assetKey, await sink.resolve(b.assetKey))
          checkAbort(signal)
        }
      }
    }
    const html = renderToStaticMarkup(<ConvSection doc={doc} options={options} />)
    docs.push(doc)
    messageTotal += doc.messages
    if (split) {
      const y = new Date(doc.startedAt).getFullYear()
      let g = years.find((x) => x.year === y)
      if (!g) {
        g = { year: y, docs: [], bodies: [] }
        years.push(g)
      }
      g.docs.push(doc)
      g.bodies.push(html)
    } else {
      bodies.push(html)
    }
    await tick()
  }
  imagesUsed = [...resolved.values()].filter(Boolean).length

  const subtitle = `${T.exporter.summary(docs.length, messageTotal, plan.diaries.length)}`
  const title = T.exporter.htmlTitle
  const diaryHtml = plan.diaries.length ? renderToStaticMarkup(<DiaryPages diaries={plan.diaries} />) : ''
  const stats: ExportStats = {
    conversations: docs.length,
    diaries: plan.diaries.length,
    messages: messageTotal,
    days: plan.days,
    images: imagesUsed,
  }
  const base = `${T.exporter.filenamePrefix}-${stamp()}`

  checkAbort(signal)
  if (!split) {
    const toc = renderToStaticMarkup(<Toc docs={docs} hasDiary={!!diaryHtml} />)
    const html = docHtml({ title, themeId: input.themeId, subtitle, body: toc + bodies.join('\n') + diaryHtml })
    return {
      format: 'html',
      kind: 'html',
      blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
      filename: `${safeFilename(base)}.html`,
      mime: 'text/html',
      stats,
      withImages: input.withImages && imagesUsed > 0,
    }
  }

  // 分卷:每年一个网页 + 目录页 + 图片文件夹
  const zip = zipBuilder()
  const enc = new TextEncoder()
  const folder = safeFilename(base)
  const yearFile = (y: number) => `回忆-${y}.html`
  years.sort((a, b) => a.year - b.year)
  const tocDocs = years.flatMap((g) => g.docs.map((d) => ({ ...d, href: yearFile(g.year) })))
  const startBody =
    `<p class="conv-meta" style="text-align:center">${escapeHtml(T.exporter.startHereBody)}</p>` +
    renderToStaticMarkup(<Toc docs={tocDocs} hasDiary={!!diaryHtml} hrefBase="心情日记.html" />)
  zip.add(`${folder}/${T.exporter.startHere}.html`, enc.encode(docHtml({ title, themeId: input.themeId, subtitle, body: startBody })), true)
  for (const g of years) {
    const body = `<h2 class="year-title">${g.year}</h2>` + g.bodies.join('\n')
    zip.add(
      `${folder}/${yearFile(g.year)}`,
      enc.encode(docHtml({ title: `${title} · ${g.year}`, themeId: input.themeId, heading: `${title} · ${g.year}`, subtitle: T.exporter.htmlCount(g.docs.length), body })),
      true,
    )
  }
  if (diaryHtml) {
    zip.add(`${folder}/心情日记.html`, enc.encode(docHtml({ title: T.exporter.htmlDiaryTitle, themeId: input.themeId, subtitle, body: diaryHtml })), true)
  }
  for (const [name, blob] of imageFiles) {
    checkAbort(signal)
    zip.add(`${folder}/${name}`, new Uint8Array(await blob.arrayBuffer()), false)
  }
  const blob = await zip.finish()
  return {
    format: 'html',
    kind: 'zip',
    blob,
    filename: `${folder}.zip`,
    mime: 'application/zip',
    stats,
    withImages: input.withImages && imagesUsed > 0,
  }
}