import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { T } from '../../core/copy'
import { getDB } from '../../core/db'
import { BackupError, buildBackup, importBackup, type BackupImportResult } from '../../core/export/backup'
import { planExport, type ExportPlan, type ExportSelection } from '../../core/export/collect'
import {
  ExportCancelled,
  buildHtmlExport,
  estimateHtmlSize,
  willSplit,
  type ExportOutput,
} from '../../core/export/html'
import { canShareFile, downloadOutput, shareOutput } from '../../core/export/save'
import { formatBytes, formatDateShort, parseDateInput } from '../../core/format'
import type { ThemeId } from '../../core/model'
import { THEMES } from '../../core/themes'
import { adapters } from '../../platforms'
import { href } from '../router'
import { Screen, Section } from '../Shell'

type Scope = 'all' | 'range' | 'pick'

type Phase =
  | { name: 'form' }
  | { name: 'working'; label: string; done: number; total: number }
  | { name: 'done'; outputs: ExportOutput[] }
  | { name: 'cancelled' }
  | { name: 'failed' }

export function ExportScreen({ currentTheme }: { currentTheme: ThemeId }) {
  const [wantHtml, setWantHtml] = useState(true)
  const [wantBackup, setWantBackup] = useState(false)
  const [chats, setChats] = useState(true)
  const [diaries, setDiaries] = useState(true)
  const [scope, setScope] = useState<Scope>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [withImages, setWithImages] = useState(true)
  const [withThinking, setWithThinking] = useState(false)
  const [theme, setTheme] = useState<ThemeId>(currentTheme)
  const [plan, setPlan] = useState<ExportPlan | null>(null)
  const [phase, setPhase] = useState<Phase>({ name: 'form' })
  const abortRef = useRef<AbortController | null>(null)

  const convs = useLiveQuery(() => getDB().conversations.filter((c) => !c.hiddenAt).toArray(), [])
  const sortedConvs = useMemo(() => [...(convs ?? [])].sort((a, b) => b.updatedAt - a.updatedAt), [convs])
  const diaryCount = useLiveQuery(() => getDB().diaries.filter((d) => !d.hiddenAt).count(), [])
  const nothingAtAll = convs !== undefined && diaryCount !== undefined && convs.length === 0 && diaryCount === 0

  const sel: ExportSelection = useMemo(() => {
    const fromTs = scope === 'range' ? parseDateInput(from) : undefined
    const toRaw = scope === 'range' ? parseDateInput(to) : undefined
    return {
      chats,
      diaries,
      convKeys: scope === 'pick' ? [...picked] : undefined,
      from: fromTs,
      to: toRaw === undefined ? undefined : toRaw + 24 * 3600 * 1000,
    }
  }, [chats, diaries, scope, from, to, picked])

  const pickEmpty = scope === 'pick' && picked.size === 0 && chats

  useEffect(() => {
    if (pickEmpty) {
      setPlan(null)
      return
    }
    let alive = true
    const id = window.setTimeout(() => {
      planExport(sel)
        .then((p) => alive && setPlan(p))
        .catch(() => alive && setPlan(null))
    }, 150)
    return () => {
      alive = false
      window.clearTimeout(id)
    }
  }, [sel, pickEmpty, convs, diaryCount])

  useEffect(() => {
    if (phase.name !== 'working') return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase.name])
  useEffect(() => () => abortRef.current?.abort(), [])

  const formatChosen = wantHtml || wantBackup
  const contentChosen = chats || diaries
  const canStart = !!plan && !plan.empty && formatChosen && contentChosen && phase.name === 'form'

  const sizeText = (() => {
    if (!plan || plan.empty) return ''
    const parts: string[] = []
    if (wantHtml) parts.push(`${T.exporter.html.name} ${T.exporter.sizeAbout(formatBytes(estimateHtmlSize(plan, withImages)))}`)
    if (wantBackup) {
      const b = plan.textBytes * 0.5 + (withImages ? plan.imageBytes : 0) + 20_000
      parts.push(`${T.exporter.backup.name} ${T.exporter.sizeAbout(formatBytes(b))}`)
    }
    return parts.join(' · ')
  })()

  const start = async () => {
    if (!plan) return
    const ctl = new AbortController()
    abortRef.current = ctl
    const outputs: ExportOutput[] = []
    try {
      if (wantHtml) {
        setPhase({ name: 'working', label: T.exporter.html.name, done: 0, total: 1 })
        outputs.push(
          await buildHtmlExport(
            { sel, themeId: theme, withImages, withThinking },
            (p) => setPhase({ name: 'working', label: T.exporter.html.name, ...p }),
            ctl.signal,
          ),
        )
      }
      if (wantBackup) {
        setPhase({ name: 'working', label: T.exporter.backup.name, done: 0, total: 1 })
        outputs.push(
          await buildBackup(
            { sel, withImages },
            (p) => setPhase({ name: 'working', label: T.exporter.backup.name, ...p }),
            ctl.signal,
          ),
        )
      }
      setPhase({ name: 'done', outputs })
    } catch (e) {
      setPhase(e instanceof ExportCancelled ? { name: 'cancelled' } : { name: 'failed' })
    } finally {
      abortRef.current = null
    }
  }

  const reset = () => setPhase({ name: 'form' })

  if (phase.name === 'working') {
    return (
      <Screen title={T.exporter.title} noBack>
        <div className="center-box">
          <div className="spinner" aria-hidden="true" />
          <h2>{T.exporter.working}</h2>
          <p className="hint">{phase.label}</p>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={phase.total} aria-valuenow={phase.done}>
            <span style={{ width: `${phase.total ? Math.round((phase.done / phase.total) * 100) : 0}%` }} />
          </div>
          <p className="hint small">{T.exporter.keepOpen}</p>
          <p className="hint small">{T.exporter.memoryTip}</p>
          <button type="button" className="btn ghost" onClick={() => abortRef.current?.abort()}>
            {T.exporter.cancelBtn}
          </button>
        </div>
      </Screen>
    )
  }

  if (phase.name === 'done') {
    return (
      <Screen title={T.exporter.title} backTo="#/">
        <div className="center-box left">
          <h2>{T.exporter.doneTitle}</h2>
          {phase.outputs.map((o) => (
            <OutputCard key={o.filename} out={o} />
          ))}
          <p className="hint small">{T.exporter.saveHint}</p>
          {phase.outputs.some((o) => o.format === 'backup') ? <p className="hint small">{T.exporter.saveBackupTip}</p> : null}
          <button type="button" className="btn soft" onClick={reset}>
            {T.common.ok}
          </button>
        </div>
      </Screen>
    )
  }

  if (phase.name === 'cancelled' || phase.name === 'failed') {
    return (
      <Screen title={T.exporter.title} backTo="#/">
        <div className="center-box">
          <h2>{phase.name === 'cancelled' ? T.exporter.cancelled : T.exporter.failTitle}</h2>
          {phase.name === 'failed' ? <p>{T.exporter.failBody}</p> : null}
          <button type="button" className="btn" onClick={reset}>
            {phase.name === 'failed' ? T.common.tryAgain : T.common.ok}
          </button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen title={T.exporter.title} backTo="#/">
      <p className="lead">{T.exporter.intro}</p>

      {nothingAtAll ? <p className="soft-alert">{T.exporter.empty}</p> : null}

      <Section title={T.exporter.chooseFormat}>
        <div className="format-cards">
          <label className={`format-card ${wantHtml ? 'on' : ''}`}>
            <input type="checkbox" checked={wantHtml} onChange={(e) => setWantHtml(e.target.checked)} />
            <span className="format-head">
              <strong>{T.exporter.html.name}</strong>
              <em>{T.exporter.html.tag}</em>
            </span>
            <span>{T.exporter.html.body}</span>
            <span className="hint small">{T.exporter.html.note}</span>
          </label>
          <label className={`format-card ${wantBackup ? 'on' : ''}`}>
            <input type="checkbox" checked={wantBackup} onChange={(e) => setWantBackup(e.target.checked)} />
            <span className="format-head">
              <strong>{T.exporter.backup.name}</strong>
              <em>{T.exporter.backup.tag}</em>
            </span>
            <span>{T.exporter.backup.body}</span>
            <span className="hint small">{T.exporter.backup.note}</span>
          </label>
        </div>
        <p className="hint">{T.exporter.bothTip}</p>
      </Section>

      <Section title={T.exporter.what}>
        <label className="check-row">
          <input type="checkbox" checked={chats} onChange={(e) => setChats(e.target.checked)} />
          {T.exporter.whatChats}
        </label>
        <label className="check-row">
          <input type="checkbox" checked={diaries} onChange={(e) => setDiaries(e.target.checked)} />
          {T.exporter.whatDiaries}
        </label>
      </Section>

      <Section title={T.exporter.scope}>
        <div className="chips" role="radiogroup">
          {(
            [
              ['all', T.exporter.scopeAll],
              ['range', T.exporter.scopeRange],
              ['pick', T.exporter.scopePick],
            ] as Array<[Scope, string]>
          ).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={scope === v} className={`chip ${scope === v ? 'on' : ''}`} onClick={() => setScope(v)}>
              {label}
            </button>
          ))}
        </div>
        {scope === 'range' ? (
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
        ) : null}
        {scope === 'pick' ? (
          <div className="pick-box">
            <p className="hint small">
              {T.exporter.pickCount(picked.size)}{' '}
              <button type="button" className="link-btn" onClick={() => setPicked(new Set(sortedConvs.map((c) => c.key)))}>
                {T.common.all}
              </button>{' '}
              <button type="button" className="link-btn" onClick={() => setPicked(new Set())}>
                {T.common.clear}
              </button>
            </p>
            <ul className="pick-list">
              {sortedConvs.map((c) => (
                <li key={c.key}>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={picked.has(c.key)}
                      onChange={(e) => {
                        const next = new Set(picked)
                        if (e.target.checked) next.add(c.key)
                        else next.delete(c.key)
                        setPicked(next)
                      }}
                    />
                    <span>
                      {c.title || T.platform.untitled}
                      <em className="hint small"> {formatDateShort(c.updatedAt)}</em>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section title={T.exporter.options}>
        <label className="check-row">
          <input type="checkbox" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} />
          <span>
            {T.exporter.withImages}
            <em className="hint small"> {T.exporter.withImagesHint}</em>
          </span>
        </label>
        {wantHtml ? (
          <label className="check-row">
            <input type="checkbox" checked={withThinking} onChange={(e) => setWithThinking(e.target.checked)} />
            {T.exporter.withThinking}
          </label>
        ) : null}
        {wantHtml ? (
          <div className="field">
            <span className="label">{T.exporter.themeForHtml}</span>
            <div className="chips" role="radiogroup">
              {THEMES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} className={`chip ${theme === t.id ? 'on' : ''}`} onClick={() => setTheme(t.id)}>
                  <i className="dot" style={{ background: t.tokens.primary }} /> {t.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Section>

      <Section title={T.exporter.summaryTitle}>
        {plan && !plan.empty ? (
          <>
            <p className="big-text">{T.exporter.summary(plan.conversations.length, plan.messageCount, plan.diaries.length)}</p>
            <p className="hint">{sizeText}</p>
            {wantHtml && willSplit(plan, withImages) ? <p className="hint">{T.exporter.splitTip}</p> : null}
          </>
        ) : (
          <p className="hint">{nothingAtAll ? T.exporter.empty : plan && plan.empty ? T.exporter.emptyScope : pickEmpty ? T.exporter.emptyScope : T.common.loading}</p>
        )}
        <button type="button" className="btn big" disabled={!canStart} onClick={() => void start()}>
          {T.exporter.start}
        </button>
      </Section>

      <BackupImport />
    </Screen>
  )
}

function OutputCard({ out }: { out: ExportOutput }) {
  const [msg, setMsg] = useState('')
  const share = canShareFile(out)
  return (
    <div className="output-card card">
      <strong>{out.filename}</strong>
      <span className="hint small">
        {formatBytes(out.blob.size)} · {T.exporter.doneBody(out.stats.conversations, out.stats.diaries, out.stats.days, out.withImages)}
      </span>
      {out.kind === 'zip' && out.format === 'html' ? <span className="hint small">{T.exporter.splitTip}</span> : null}
      <div className="row">
        <button type="button" className="btn" onClick={() => downloadOutput(out)}>
          {T.exporter.saveFile}
        </button>
        {share ? (
          <button
            type="button"
            className="btn soft"
            onClick={async () => {
              try {
                await shareOutput(out)
              } catch {
                setMsg(T.error.generic)
              }
            }}
          >
            {T.exporter.shareFile}
          </button>
        ) : null}
      </div>
      {share ? <span className="hint small">{T.exporter.shareHint}</span> : null}
      {msg ? <span className="soft-alert">{msg}</span> : null}
    </div>
  )
}

function BackupImport() {
  const input = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<
    | { name: 'idle' }
    | { name: 'working'; done: number; total: number }
    | { name: 'done'; r: BackupImportResult }
    | { name: 'problem'; text: string }
  >({ name: 'idle' })

  const onPick = async (file?: File) => {
    if (!file) return
    setState({ name: 'working', done: 0, total: 1 })
    try {
      const r = await importBackup(file, (p) => setState({ name: 'working', ...p }))
      setState({ name: 'done', r })
    } catch (e) {
      if (e instanceof BackupError) {
        setState({
          name: 'problem',
          text: e.reason === 'too-new' ? T.exporter.backupTooNew : e.reason === 'damaged' ? T.exporter.backupDamaged : T.exporter.backupNotBackup,
        })
      } else {
        setState({ name: 'problem', text: T.error.generic })
      }
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  return (
    <Section title={T.exporter.importBackup} hint={T.exporter.importBackupHint}>
      <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={(e) => void onPick(e.target.files?.[0])} />
      {state.name === 'working' ? (
        <div className="working">
          <div className="progress">
            <span style={{ width: `${state.total ? Math.round((state.done / state.total) * 100) : 0}%` }} />
          </div>
          <p className="hint small">{T.import.working}</p>
        </div>
      ) : (
        <button type="button" className="btn soft" onClick={() => input.current?.click()}>
          {T.import.chooseZip}
        </button>
      )}
      {state.name === 'done' ? (
        <>
          <p className="big-text">{T.exporter.importBackupDone(state.r.conversations, state.r.diaries)}</p>
          {state.r.skippedConversations + state.r.skippedDiaries > 0 ? <p className="hint">{T.exporter.importBackupSkipped}</p> : null}
          {state.r.damagedAssets > 0 ? <p className="hint">{T.import.doneMissingImages(state.r.damagedAssets)}</p> : null}
          <a className="link-btn" href={href(['p', adapters[0].platform.id])}>
            {T.import.openLibrary}
          </a>
        </>
      ) : null}
      {state.name === 'problem' ? <p className="soft-alert">{state.text}</p> : null}
    </Section>
  )
}
