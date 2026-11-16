import { useEffect, useRef, useState } from 'react'
import { T } from '../../core/copy'
import {
  OpenSourceError,
  importFromSource,
  openFromFiles,
  type ImportResult,
  type OpenedSource,
} from '../../core/importer'
import { getAdapter } from '../../platforms'
import { go, href } from '../router'
import { Screen, Section } from '../Shell'
import { SparkleSticker } from '../stickers'

type Phase =
  | { name: 'idle' }
  | { name: 'opening' }
  | { name: 'ready'; opened: OpenedSource }
  | { name: 'importing'; done: number; total: number }
  | { name: 'done'; result: ImportResult }
  | { name: 'problem'; text: string }

export function ImportScreen({ platformId }: { platformId: string }) {
  const adapter = getAdapter(platformId)
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const [dragging, setDragging] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const zipInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)
  const canFolder = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches

  const busy = phase.name === 'opening' || phase.name === 'importing'
  useEffect(() => {
    if (!busy) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

  useEffect(() => () => abortRef.current?.abort(), [])

  if (!adapter) return null

  const pick = async (files: File[]) => {
    if (files.length === 0) {
      setPhase({ name: 'problem', text: T.import.emptyPick })
      return
    }
    setPhase({ name: 'opening' })
    try {
      const opened = await openFromFiles(files)
      if (opened.adapter.platform.id !== platformId) {
        setPhase({ name: 'problem', text: T.import.notRecognized })
        return
      }
      setPhase({ name: 'ready', opened })
    } catch (e) {
      if (e instanceof OpenSourceError) {
        setPhase({ name: 'problem', text: e.reason === 'unreadable' ? T.import.unreadable : e.reason === 'empty' ? T.import.emptyPick : T.import.notRecognized })
      } else {
        setPhase({ name: 'problem', text: T.error.generic })
      }
    }
  }

  const start = async (opened: OpenedSource) => {
    const ctl = new AbortController()
    abortRef.current = ctl
    setPhase({ name: 'importing', done: 0, total: opened.conversationCount })
    try {
      const result = await importFromSource(opened, (p) => setPhase({ name: 'importing', done: p.done, total: p.total }), ctl.signal)
      setPhase({ name: 'done', result })
      if (!result.cancelled && result.added + result.updated > 0) {
        // 请设备尽量长久地保存这些回忆(静默进行,失败也没关系)
        navigator.storage?.persist?.().catch(() => {})
      }
    } catch {
      setPhase({ name: 'problem', text: T.error.generic })
    } finally {
      abortRef.current = null
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (busy) return
    void pick([...e.dataTransfer.files])
  }

  const reset = () => {
    setPhase({ name: 'idle' })
    if (zipInput.current) zipInput.current.value = ''
    if (dirInput.current) dirInput.current.value = ''
  }

  return (
    <Screen title={T.import.title} subtitle={adapter.platform.name} backTo={href(['p', platformId])}>
      <div className="import-hero">
        <img src={`./${adapter.icon}`} alt="" width={72} height={72} />
        <p>{adapter.guide.intro}</p>
      </div>

      <Section title={T.import.guideTitle}>
        <ol className="steps">
          {adapter.guide.steps.map((s, i) => (
            <li key={s.title}>
              <span className="step-no">{T.import.stepOf(i + 1)}</span>
              <strong>{s.title}</strong>
              {s.detail ? <span className="step-detail">{s.detail}</span> : null}
            </li>
          ))}
        </ol>
        <details className="note-details">
          <summary>{T.import.tipsTitle}</summary>
          <ul className="tips">
            {adapter.guide.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>
      </Section>

      <Section title={T.import.chooseTitle}>
        <div
          className={`dropzone ${dragging ? 'on' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {phase.name === 'idle' || phase.name === 'problem' ? (
            <>
              {phase.name === 'problem' ? <p className="soft-alert">{phase.text}</p> : null}
              <input
                ref={zipInput}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                hidden
                onChange={(e) => void pick([...(e.target.files ?? [])])}
              />
              <input
                ref={dirInput}
                type="file"
                hidden
                {...({ webkitdirectory: '' } as Record<string, string>)}
                multiple
                onChange={(e) => void pick([...(e.target.files ?? [])])}
              />
              <button type="button" className="btn big" onClick={() => zipInput.current?.click()}>
                {T.import.chooseZip}
              </button>
              {canFolder ? (
                <button type="button" className="btn soft" onClick={() => dirInput.current?.click()}>
                  {T.import.chooseFolder}
                </button>
              ) : null}
              {canFolder ? <p className="hint small">{T.import.drop}</p> : null}
              <p className="privacy-line">
                <SparkleSticker size={14} /> {T.import.privacy}
              </p>
            </>
          ) : null}

          {phase.name === 'opening' ? (
            <div className="working">
              <div className="spinner" aria-hidden="true" />
              <p>{T.import.reading}</p>
              <p className="hint small">{T.import.working}</p>
            </div>
          ) : null}

          {phase.name === 'ready' ? (
            <div className="ready">
              <p className="big-text">{T.import.detected(phase.opened.adapter.platform.name, phase.opened.conversationCount)}</p>
              <p className="hint small">{phase.opened.label}</p>
              <p className="hint small">
                {T.import.version(phase.opened.formatVersion)}
                {phase.opened.formatVersion !== '3' && phase.opened.formatVersion !== 'unknown' ? ` · ${T.import.versionNew}` : ''}
              </p>
              <div className="row">
                <button type="button" className="btn big" onClick={() => void start(phase.opened)}>
                  {T.import.startImport}
                </button>
                <button type="button" className="btn ghost" onClick={reset}>
                  {T.common.cancel}
                </button>
              </div>
            </div>
          ) : null}

          {phase.name === 'importing' ? (
            <div className="working">
              <p>{T.import.saving}</p>
              <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={phase.total} aria-valuenow={phase.done}>
                <span style={{ width: `${phase.total ? Math.round((phase.done / phase.total) * 100) : 0}%` }} />
              </div>
              <p className="hint small">{T.import.progress(phase.done, phase.total)}</p>
              <p className="hint small">{T.import.working}</p>
              <button type="button" className="btn ghost" onClick={() => abortRef.current?.abort()}>
                {T.common.cancel}
              </button>
            </div>
          ) : null}

          {phase.name === 'done' ? <DoneCard result={phase.result} platformId={platformId} onAgain={reset} /> : null}
        </div>
      </Section>
    </Screen>
  )
}

function DoneCard({ result, platformId, onAgain }: { result: ImportResult; platformId: string; onAgain: () => void }) {
  const lines: string[] = []
  if (result.added) lines.push(T.import.doneAdded(result.added))
  if (result.updated) lines.push(T.import.doneUpdated(result.updated))
  if (result.skipped) lines.push(T.import.doneSkipped(result.skipped))
  if (result.images) lines.push(T.import.doneImages(result.images))
  if (result.missingImages) lines.push(T.import.doneMissingImages(result.missingImages))
  if (result.warnings) lines.push(T.import.doneWarnings(result.warnings))
  if (result.failed) lines.push(T.import.doneFailed(result.failed))
  return (
    <div className="done">
      <SparkleSticker size={36} />
      <h3>{result.cancelled ? T.import.cancelledTitle : T.import.doneTitle}</h3>
      {result.cancelled ? <p>{T.import.cancelledBody}</p> : null}
      <ul className="done-lines">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="row">
        <button type="button" className="btn big" onClick={() => go(href(['p', platformId]))}>
          {T.import.openLibrary}
        </button>
        <button type="button" className="btn ghost" onClick={onAgain}>
          {T.platform.importAgain}
        </button>
      </div>
    </div>
  )
}
