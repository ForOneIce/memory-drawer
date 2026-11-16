import type { ThemeId } from './model'

export interface Settings {
  theme: ThemeId
  quiet: boolean
}

const KEY = 'memory-drawer.settings'
export const DEFAULT_SETTINGS: Settings = { theme: 'calm', quiet: false }

const THEMES: ThemeId[] = ['calm', 'relax', 'miss', 'joy', 'night']

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const p = JSON.parse(raw) as Partial<Settings>
    return {
      theme: THEMES.includes(p.theme as ThemeId) ? (p.theme as ThemeId) : DEFAULT_SETTINGS.theme,
      quiet: p.quiet === true,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* 存不下也不影响使用 */
  }
}

export function applySettings(s: Settings) {
  const root = document.documentElement
  root.dataset.theme = s.theme
  root.dataset.quiet = s.quiet ? 'true' : 'false'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_META[s.theme])
}

const THEME_META: Record<ThemeId, string> = {
  calm: '#5B8DEF',
  relax: '#4CBF7A',
  miss: '#B57BEA',
  joy: '#FFD21F',
  night: '#3A3E47',
}
