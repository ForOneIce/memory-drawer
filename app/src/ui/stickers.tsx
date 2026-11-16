import type { CSSProperties, ReactNode } from 'react'

/**
 * 手账贴纸。全部是内联 SVG,颜色来自主题变量,不依赖任何外部资源(导出的 HTML 里也能用)。
 */
interface StickerProps {
  size?: number
  className?: string
  style?: CSSProperties
  title?: string
}

function Svg({
  size = 32,
  viewBox,
  className,
  style,
  title,
  children,
}: StickerProps & { viewBox: string; children: ReactNode }) {
  const [, , w, h] = viewBox.split(' ').map(Number)
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={(size * h) / w}
      viewBox={viewBox}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

/** 贴纸的白色描边,让它看起来像剪下来的贴纸 */
const OUTLINE = { stroke: '#fff', strokeWidth: 5, strokeLinejoin: 'round' as const, paintOrder: 'stroke' as const }

/** 鲸鱼发夹:DeepSeek 拟人形象头发上的小鲸鱼 */
export function WhaleSticker(p: StickerProps) {
  return (
    <Svg viewBox="0 0 80 60" {...p}>
      <g style={{ filter: 'drop-shadow(0 1.5px 1.5px rgba(30,50,110,.28))' }}>
        {/* 尾巴 */}
        <path
          d="M60 30 C64 22 70 20 74 14 C75 22 74 29 70 33 C73 35 77 36 79 41 C72 42 66 40 61 37Z"
          fill="#2F58C8"
          {...OUTLINE}
        />
        {/* 身体 */}
        <path
          d="M5 35 C4 19 20 8 38 9 C54 10 66 20 65 34 C64 47 52 53 36 52 C20 51 6 49 5 35Z"
          fill="#2F58C8"
          {...OUTLINE}
        />
        {/* 喷水 */}
        <path d="M30 9 C28 4 24 3 22 5 M30 9 C32 4 36 3 38 5" stroke="#2F58C8" strokeWidth="3" strokeLinecap="round" fill="none" />
        {/* 肚皮 */}
        <path d="M7 38 C16 34 26 40 38 48 C44 51 40 52 36 52 C22 51 8 49 7 38Z" fill="#fff" />
        <path d="M14 30 C20 24 30 22 40 25 C32 27 22 29 14 30Z" fill="#fff" opacity=".85" />
      </g>
      {/* 眼睛 */}
      <circle cx="49" cy="28" r="4.2" fill="#fff" />
      <circle cx="50" cy="28" r="2.1" fill="#1D3C96" />
      <circle cx="50.8" cy="27.2" r=".8" fill="#fff" />
      {/* 脸颊 */}
      <ellipse cx="55" cy="36" rx="3.2" ry="2" fill="#FF9FC4" opacity=".75" />
    </Svg>
  )
}

/** 四角闪光(千禧年经典小星星) */
export function SparkleSticker({ color = 'var(--accent)', ...p }: StickerProps & { color?: string }) {
  return (
    <Svg viewBox="0 0 64 64" {...p}>
      <path
        d="M32 4 C34 22 42 30 60 32 C42 34 34 42 32 60 C30 42 22 34 4 32 C22 30 30 22 32 4Z"
        fill={color}
        {...OUTLINE}
        style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.2))' }}
      />
    </Svg>
  )
}

export function HeartSticker({ color = '#FF86B8', ...p }: StickerProps & { color?: string }) {
  return (
    <Svg viewBox="0 0 64 60" {...p}>
      <path
        d="M32 55 C10 40 5 28 8 18 C11 8 24 6 32 17 C40 6 53 8 56 18 C59 28 54 40 32 55Z"
        fill={color}
        {...OUTLINE}
        style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.2))' }}
      />
      <path d="M17 20 C19 16 23 15 26 17" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".8" />
    </Svg>
  )
}

export function StarSticker({ color = 'var(--accent)', ...p }: StickerProps & { color?: string }) {
  return (
    <Svg viewBox="0 0 64 64" {...p}>
      <path
        d="M32 6 L39 24 L58 25 L43 37 L48 56 L32 45 L16 56 L21 37 L6 25 L25 24Z"
        fill={color}
        {...OUTLINE}
        style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.2))' }}
      />
    </Svg>
  )
}

export function CloudSticker({ color = '#fff', ...p }: StickerProps & { color?: string }) {
  return (
    <Svg viewBox="0 0 80 52" {...p}>
      <path
        d="M20 44 C8 44 4 32 12 27 C10 16 24 10 31 18 C35 6 55 6 58 20 C70 18 76 32 66 38 C64 44 56 44 52 44Z"
        fill={color}
        stroke="var(--secondary)"
        strokeWidth="3"
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 1.5px 1.5px rgba(0,0,0,.15))' }}
      />
      <circle cx="30" cy="31" r="2" fill="var(--ink-soft)" />
      <circle cx="46" cy="31" r="2" fill="var(--ink-soft)" />
      <path d="M35 35 C38 38 41 38 43 35" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" fill="none" />
    </Svg>
  )
}

export function MoonSticker({ color = 'var(--accent)', ...p }: StickerProps & { color?: string }) {
  return (
    <Svg viewBox="0 0 64 64" {...p}>
      <path
        d="M44 8 C28 10 18 22 20 38 C22 52 36 60 52 54 C36 52 30 38 34 26 C36 18 40 12 44 8Z"
        fill={color}
        {...OUTLINE}
        style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.2))' }}
      />
    </Svg>
  )
}

export function FlowerSticker({ color = '#FFB3D1', ...p }: StickerProps & { color?: string }) {
  const petals = [0, 72, 144, 216, 288]
  return (
    <Svg viewBox="0 0 64 64" {...p}>
      <g style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.2))' }}>
        {petals.map((r) => (
          <ellipse key={r} cx="32" cy="16" rx="9" ry="12" fill={color} {...OUTLINE} strokeWidth="3" transform={`rotate(${r} 32 32)`} />
        ))}
        <circle cx="32" cy="32" r="8" fill="#FFE27A" stroke="#fff" strokeWidth="3" />
      </g>
    </Svg>
  )
}

/** 日期戳 */
export function Stamp({ children }: { children: ReactNode }) {
  return <span className="stamp">{children}</span>
}

/** 胶带 */
export function Tape({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`tape ${className}`} style={style} aria-hidden="true" />
}

/** 桌面小图标:备忘录(记事本) */
export function MemoIcon({ size = 64 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 64 64" size={size}>
      <rect x="10" y="8" width="44" height="50" rx="9" fill="#FFE27A" />
      <rect x="10" y="8" width="44" height="14" rx="9" fill="#FFB13B" />
      <rect x="10" y="16" width="44" height="6" fill="#FFB13B" />
      {[18, 28, 38, 48].map((x) => (
        <rect key={x} x={x - 2.5} y="4" width="5" height="10" rx="2.5" fill="#fff" stroke="#C98200" strokeWidth="1.5" />
      ))}
      <path d="M18 32 H46 M18 40 H46 M18 48 H34" stroke="#D49A1E" strokeWidth="2.5" strokeLinecap="round" opacity=".75" />
      <path d="M44 44 C42 40 47 38 48 42 C49 38 54 40 52 44 C51 47 48 49 48 49 C48 49 45 47 44 44Z" fill="#FF86B8" />
    </Svg>
  )
}

/** 桌面小图标:收纳盒 */
export function BoxIcon({ size = 64 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 64 64" size={size}>
      <rect x="8" y="22" width="48" height="34" rx="8" fill="#FF9EC8" />
      <rect x="6" y="14" width="52" height="14" rx="7" fill="#FF7FB4" />
      <rect x="28" y="14" width="8" height="42" fill="#fff" opacity=".9" />
      <path d="M32 14 C26 4 16 6 20 13 C22 16 30 14 32 14Z M32 14 C38 4 48 6 44 13 C42 16 34 14 32 14Z" fill="#fff" stroke="#FF7FB4" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="32" cy="14" r="3.5" fill="#FFE27A" />
    </Svg>
  )
}

/** 桌面小图标:设置 */
export function SettingsIcon({ size = 64 }: { size?: number }) {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315]
  return (
    <Svg viewBox="0 0 64 64" size={size}>
      <g>
        {teeth.map((r) => (
          <rect key={r} x="27" y="5" width="10" height="14" rx="4" fill="#7ED6B0" transform={`rotate(${r} 32 32)`} />
        ))}
        <circle cx="32" cy="32" r="19" fill="#7ED6B0" />
        <circle cx="32" cy="32" r="9" fill="#fff" />
        <circle cx="29" cy="31" r="1.6" fill="#3E8E70" />
        <circle cx="35" cy="31" r="1.6" fill="#3E8E70" />
        <path d="M29 35 C31 37 33 37 35 35" stroke="#3E8E70" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </g>
    </Svg>
  )
}

/** 小图标:放大镜、返回、笔等,用于界面按钮 */
export function Glyph({ name, size = 22 }: { name: 'search' | 'back' | 'send' | 'filter' | 'plus' | 'close' | 'pencil' | 'chevron'; size?: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {name === 'search' && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" {...common} />
          <path d="M15.5 15.5 L21 21" {...common} />
        </>
      )}
      {name === 'back' && <path d="M15 5 L8 12 L15 19" {...common} />}
      {name === 'chevron' && <path d="M9 5 L16 12 L9 19" {...common} />}
      {name === 'send' && <path d="M4 12 L20 4 L14 20 L11.5 13 Z" {...common} />}
      {name === 'filter' && <path d="M4 6 H20 M7 12 H17 M10 18 H14" {...common} />}
      {name === 'plus' && <path d="M12 5 V19 M5 12 H19" {...common} />}
      {name === 'close' && <path d="M6 6 L18 18 M18 6 L6 18" {...common} />}
      {name === 'pencil' && <path d="M5 19 L6 14 L16 4 L20 8 L10 18 Z M14 6 L18 10" {...common} />}
    </svg>
  )
}
