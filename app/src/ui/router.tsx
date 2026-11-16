import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { T } from '../core/copy'

/** 极简 hash 路由:#/path?query */
export interface Route {
  path: string[]
  query: URLSearchParams
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [p, q = ''] = raw.split('?')
  return {
    path: p.split('/').filter(Boolean).map(decodeURIComponent),
    query: new URLSearchParams(q),
  }
}

export function href(path: Array<string | number>, query?: Record<string, string | undefined>): string {
  const p = '/' + path.map((s) => encodeURIComponent(String(s))).join('/')
  const q = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
        .join('&')
    : ''
  return `#${p}${q ? '?' + q : ''}`
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function go(to: string) {
  window.location.hash = to.replace(/^#/, '')
}

export function replace(to: string) {
  const url = window.location.pathname + window.location.search + '#' + to.replace(/^#/, '')
  window.history.replaceState(null, '', url)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

/** 返回上一页;如果没有上一页(例如直接打开链接),回到 fallback */
export function goBack(fallback = '#/') {
  if (window.history.length > 1) window.history.back()
  else go(fallback)
}

// ---- 二次确认 ----
export interface ConfirmOptions {
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  tip?: string
}
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false)
/** 需要用户再确认一次的操作。返回 true 表示用户确认了;点空白处、按 Esc、点"先不了"都视为取消 */
export const useConfirm = () => useContext(ConfirmCtx)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  const ask = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState((prev) => {
          prev?.resolve(false)
          return { opts, resolve }
        })
      }),
    [],
  )
  const close = useCallback((ok: boolean) => {
    setState((prev) => {
      prev?.resolve(ok)
      return null
    })
  }, [])

  useEffect(() => {
    if (!state) return
    // 默认把焦点放在"先不了"上,避免手滑直接确认
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, close])

  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {state ? (
        <div className="sheet-wrap confirm-wrap" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body">
          <button type="button" className="sheet-backdrop" aria-label={T.common.close} onClick={() => close(false)} />
          <div className="sheet confirm-sheet">
            <h2 id="confirm-title">{state.opts.title}</h2>
            <p id="confirm-body">{state.opts.body}</p>
            {state.opts.tip ? <p className="hint small">{state.opts.tip}</p> : null}
            <div className="confirm-actions">
              <button ref={cancelRef} type="button" className="btn big" onClick={() => close(false)}>
                {state.opts.cancelLabel}
              </button>
              <button type="button" className="btn soft" onClick={() => close(true)}>
                {state.opts.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmCtx.Provider>
  )
}

// ---- 轻提示 ----
interface ToastItem {
  id: number
  text: string
  undo?: () => void
}
const ToastCtx = createContext<(text: string, undo?: () => void) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const push = useCallback((text: string, undo?: () => void) => {
    const id = ++seq.current
    setItems((l) => [...l.slice(-2), { id, text, undo }])
    window.setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), undo ? 6000 : 2600)
  }, [])
  const value = useMemo(() => push, [push])
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div className="toast" key={t.id}>
            <span>{t.text}</span>
            {t.undo ? (
              <button
                type="button"
                onClick={() => {
                  t.undo?.()
                  setItems((l) => l.filter((x) => x.id !== t.id))
                }}
              >
                {T.common.undo}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
