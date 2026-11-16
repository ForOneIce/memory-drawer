import type { ThemeId } from './model'

/**
 * 情绪色彩。
 * 宁静=蓝、轻松=绿、想念=粉紫、快乐=亮黄、夜深=银灰(需求评审 2026-11-16)。
 * 所有颜色集中在这里,既用于界面,也用于手账 HTML 导出,并有对比度测试保证文字清晰可读。
 */
export interface ThemeTokens {
  /** 页面纸色 */
  paper: string
  /** 卡片/便签底色 */
  card: string
  ink: string
  inkSoft: string
  primary: string
  /** 主色按钮上的文字颜色 */
  onPrimary: string
  /** 链接/强调文字色(保证在纸上清晰可读) */
  link: string
  secondary: string
  tape: string
  line: string
  bg1: string
  bg2: string
  /** "我"的便签底色 */
  userSlip: string
  /** 对方的便签底色 */
  asstSlip: string
  /** 贴纸点缀色 */
  accent: string
}

export interface ThemeDef {
  id: ThemeId
  name: string
  hint: string
  tokens: ThemeTokens
}

export const THEMES: ThemeDef[] = [
  {
    id: 'calm',
    name: '宁静',
    hint: '像海边的蓝',
    tokens: {
      paper: '#F4F8FF',
      card: '#FFFFFF',
      ink: '#23324D',
      inkSoft: '#53638A',
      primary: '#2F5FCB',
      onPrimary: '#FFFFFF',
      link: '#264FA8',
      secondary: '#CFE0FF',
      tape: '#A9C8FF',
      line: '#D6E2FA',
      bg1: '#BFD8FF',
      bg2: '#EAD9FF',
      userSlip: '#E3EEFF',
      asstSlip: '#FFFFFF',
      accent: '#FFD966',
    },
  },
  {
    id: 'relax',
    name: '轻松',
    hint: '像草地上的风',
    tokens: {
      paper: '#F3FBF4',
      card: '#FFFFFF',
      ink: '#1F3D2B',
      inkSoft: '#46664F',
      primary: '#237A4B',
      onPrimary: '#FFFFFF',
      link: '#1B6A3F',
      secondary: '#CDEFD7',
      tape: '#A8E3BC',
      line: '#D3EBD9',
      bg1: '#BDEFCB',
      bg2: '#FFF4B8',
      userSlip: '#E1F5E7',
      asstSlip: '#FFFFFF',
      accent: '#FF9FC4',
    },
  },
  {
    id: 'miss',
    name: '想念',
    hint: '像傍晚的云',
    tokens: {
      paper: '#FBF3FF',
      card: '#FFFFFF',
      ink: '#3D2650',
      inkSoft: '#6A4F7E',
      primary: '#8A3FC9',
      onPrimary: '#FFFFFF',
      link: '#7A2FB8',
      secondary: '#EBD2FA',
      tape: '#F2B6E4',
      line: '#EBD9F5',
      bg1: '#E4C9FA',
      bg2: '#FFC9E6',
      userSlip: '#F3E4FC',
      asstSlip: '#FFFFFF',
      accent: '#8FD3FF',
    },
  },
  {
    id: 'joy',
    name: '快乐',
    hint: '像一颗小太阳',
    tokens: {
      paper: '#FFFBE6',
      card: '#FFFFFF',
      ink: '#43350A',
      inkSoft: '#6B571A',
      primary: '#FFD21F',
      onPrimary: '#3B2E00',
      link: '#855400',
      secondary: '#FFF0A6',
      tape: '#FFE46B',
      line: '#F1E4A3',
      bg1: '#FFE680',
      bg2: '#FFC7A8',
      userSlip: '#FFF3B8',
      asstSlip: '#FFFFFF',
      accent: '#6EC6FF',
    },
  },
  {
    id: 'night',
    name: '夜深',
    hint: '像月光下的银灰',
    tokens: {
      paper: '#353941',
      card: '#424751',
      ink: '#F0F2F6',
      inkSoft: '#C3C8D2',
      primary: '#C9CED8',
      onPrimary: '#23262D',
      link: '#EDF0F6',
      secondary: '#5A606D',
      tape: '#8D94A3',
      line: '#555B68',
      bg1: '#4A4F5A',
      bg2: '#2E3138',
      userSlip: '#4B5160',
      asstSlip: '#3E434D',
      accent: '#FFE08A',
    },
  },
]

export function getTheme(id: ThemeId): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

const cssName = (k: string) => '--' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())

export function themeVars(t: ThemeTokens): string {
  return Object.entries(t)
    .map(([k, v]) => `${cssName(k)}:${v};`)
    .join('')
}

/** 全部主题的 CSS 变量定义 */
export function themeCss(): string {
  return THEMES.map((t) => `:root[data-theme="${t.id}"]{${themeVars(t.tokens)}}`).join('\n')
}

// ---- 对比度(WCAG) ----

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
