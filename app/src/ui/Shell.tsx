import { Component, type ReactNode } from 'react'
import { T } from '../core/copy'
import { goBack, go } from './router'
import { Glyph } from './stickers'

/** 一个页面的外壳:顶栏 + 可滚动内容 + 可选底栏 */
export function Screen({
  title,
  subtitle,
  onBack,
  backTo,
  right,
  children,
  footer,
  contentRef,
  noBack,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  backTo?: string
  right?: ReactNode
  children: ReactNode
  footer?: ReactNode
  contentRef?: React.Ref<HTMLDivElement>
  noBack?: boolean
}) {
  return (
    <div className="screen">
      <header className="topbar">
        {noBack ? (
          <span className="topbar-space" />
        ) : (
          <button type="button" className="icon-btn" aria-label={T.common.back} onClick={onBack ?? (() => goBack(backTo))}>
            <Glyph name="back" />
          </button>
        )}
        <div className="topbar-title">
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="topbar-right">{right}</div>
      </header>
      <div className="content" ref={contentRef}>
        {children}
      </div>
      {footer ? <div className="footer">{footer}</div> : null}
    </div>
  )
}

export function Section({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <section className="section">
      {title ? <h2>{title}</h2> : null}
      {hint ? <p className="hint">{hint}</p> : null}
      {children}
    </section>
  )
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn(error)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="screen">
        <div className="content center-box">
          <p>{T.error.boundary}</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              this.setState({ failed: false })
              go('#/')
            }}
          >
            {T.error.backHome}
          </button>
        </div>
      </div>
    )
  }
}
