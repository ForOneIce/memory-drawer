import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { T } from '../../core/copy'
import { getDB } from '../../core/db'
import { restoreDiary } from '../../core/diary'
import { removeConversation, removeDiary, restoreConversation } from '../../core/library'
import { formatBytes, formatDateShort } from '../../core/format'
import { APP_VERSION } from '../../core/model'
import { THEMES } from '../../core/themes'
import type { Settings } from '../../core/settings'
import { go, href, useConfirm, useToast } from '../router'
import { Screen, Section } from '../Shell'

export function SettingsScreen({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null | undefined>(undefined)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const e = await navigator.storage?.estimate?.()
        if (alive) setStorage(e && e.usage !== undefined && e.quota !== undefined ? { usage: e.usage, quota: e.quota } : null)
        const p = await navigator.storage?.persisted?.()
        if (alive) setPersisted(p ?? null)
      } catch {
        if (alive) setStorage(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const askPersist = async () => {
    try {
      setPersisted((await navigator.storage?.persist?.()) ?? false)
    } catch {
      setPersisted(false)
    }
  }

  return (
    <Screen title={T.settings.title} backTo="#/">
      <Section title={T.settings.theme} hint={T.settings.themeHint}>
        <div className="theme-grid" role="radiogroup" aria-label={T.settings.theme}>
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={settings.theme === t.id}
              className={`theme-card ${settings.theme === t.id ? 'on' : ''}`}
              onClick={() => onChange({ ...settings, theme: t.id })}
            >
              <span className="swatch" style={{ background: `linear-gradient(135deg, ${t.tokens.bg1}, ${t.tokens.bg2})` }}>
                <i style={{ background: t.tokens.primary }} />
                <i style={{ background: t.tokens.accent }} />
              </span>
              <span className="theme-name">{t.name}</span>
              <span className="theme-hint">{t.hint}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section>
        <label className="switch-row">
          <span>
            <strong>{T.settings.quiet}</strong>
            <span className="hint small">{T.settings.quietHint}</span>
          </span>
          <input type="checkbox" role="switch" checked={settings.quiet} onChange={(e) => onChange({ ...settings, quiet: e.target.checked })} />
        </label>
      </Section>

      <Section title={T.settings.storage}>
        <p>
          {storage
            ? T.settings.storageUsed(formatBytes(storage.usage), formatBytes(storage.quota))
            : storage === null
              ? T.settings.storageUnknown
              : T.common.loading}
        </p>
        {persisted === true ? (
          <p className="hint">{T.settings.storagePersisted}</p>
        ) : persisted === false ? (
          <>
            <p className="hint">{T.settings.storageNotPersisted}</p>
            <button type="button" className="btn soft" onClick={() => void askPersist()}>
              {T.settings.storagePersist}
            </button>
          </>
        ) : null}
        <p className="hint small">{T.settings.install}</p>
        <button type="button" className="btn soft" onClick={() => go(href(['export']))}>
          {T.home.export}
        </button>
      </Section>

      <Section>
        <button type="button" className="row-link" onClick={() => go(href(['settings', 'hidden']))}>
          <span>
            <strong>{T.settings.hidden}</strong>
            <span className="hint small">{T.settings.hiddenHint}</span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
      </Section>

      <Section title={T.settings.privacyTitle}>
        <p>{T.settings.privacyBody}</p>
      </Section>

      <p className="hint small center">
        {T.appName} · {T.settings.version(APP_VERSION)}
      </p>
      <p className="hint small center">
        <a href={T.settings.copyrightLink} target="_blank" rel="noopener noreferrer">
          {T.settings.copyright}
        </a>
      </p>
      <p className="hint small center">
        {T.settings.license}{' '}
        <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans" target="_blank" rel="noopener noreferrer">
          {T.settings.licenseLink}
        </a>
      </p>
    </Screen>
  )
}

export function HiddenScreen() {
  const toast = useToast()
  const confirm = useConfirm()
  const convs = useLiveQuery(() => getDB().conversations.filter((c) => !!c.hiddenAt).toArray(), [])
  const diaries = useLiveQuery(() => getDB().diaries.filter((d) => !!d.hiddenAt).toArray(), [])

  const restoreConv = async (key: string) => {
    await restoreConversation(key)
    toast(T.toast.restored)
  }
  const removeConv = async (key: string) => {
    const ok = await confirm({
      title: T.confirm.removeConvTitle,
      body: T.confirm.removeConvBody,
      tip: T.confirm.tipBackup,
      confirmLabel: T.confirm.removeOk,
      cancelLabel: T.confirm.removeCancel,
    })
    if (!ok) return
    await removeConversation(key)
    toast(T.settings.removedToast)
  }
  const removeDiaryItem = async (id: string) => {
    const ok = await confirm({
      title: T.confirm.removeDiaryTitle,
      body: T.confirm.removeDiaryBody,
      tip: T.confirm.tipBackup,
      confirmLabel: T.confirm.removeOk,
      cancelLabel: T.confirm.removeCancel,
    })
    if (!ok) return
    await removeDiary(id)
    toast(T.settings.removedToast)
  }
  const empty = convs && diaries && convs.length === 0 && diaries.length === 0

  return (
    <Screen title={T.settings.hidden} backTo={href(['settings'])}>
      {empty ? <p className="empty">{T.settings.hiddenEmpty}</p> : null}
      {convs && convs.length > 0 ? (
        <Section title={T.platform.listTitle}>
          <ul className="plain-list">
            {convs.map((c) => (
              <li key={c.key}>
                <span>
                  <strong>{c.title || T.platform.untitled}</strong>
                  <span className="hint small">{formatDateShort(c.updatedAt)}</span>
                </span>
                <span className="row-actions">
                  <button type="button" className="mini-btn" onClick={() => void restoreConv(c.key)}>
                    {T.common.restore}
                  </button>
                  <button type="button" className="mini-btn quiet" onClick={() => void removeConv(c.key)}>
                    {T.settings.removeBtn}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {diaries && diaries.length > 0 ? (
        <Section title={T.memo.title}>
          <ul className="plain-list">
            {diaries.map((d) => (
              <li key={d.id}>
                <span>
                  <strong>{d.content.slice(0, 40)}</strong>
                  <span className="hint small">{formatDateShort(d.createdAt)}</span>
                </span>
                <span className="row-actions">
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={async () => {
                      await restoreDiary(d.id)
                      toast(T.toast.restored)
                    }}
                  >
                    {T.common.restore}
                  </button>
                  <button type="button" className="mini-btn quiet" onClick={() => void removeDiaryItem(d.id)}>
                    {T.settings.removeBtn}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </Screen>
  )
}
